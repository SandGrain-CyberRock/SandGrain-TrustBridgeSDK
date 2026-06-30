from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, Tuple, List

import aiohttp
from sandgrain_cloud_sdk import CloudSDK, CloudSDKConfig, JsonFileCredentialsStore

from .config import load_config

async def _create_sdk_instance() -> Tuple[CloudSDK, aiohttp.ClientSession]:
    """
    Build a single CloudSDK instance plus its dedicated aiohttp session.

    Why a dedicated session per SDK?
    - Keeps connection pools isolated and predictable.
    - Makes lifecycle management explicit (close sessions on shutdown).
    """
    cfg = load_config()
    session = aiohttp.ClientSession()

    creds = JsonFileCredentialsStore(cfg.device_credentials_json)
    sdk = CloudSDK(
        cfg=CloudSDKConfig(
            base_url=cfg.cyberrock_base_url,
            poll_interval_s=1.0,
            poll_timeout_s=30.0,
        ),
        session=session,
        creds=creds,
        cf_access_client_id=cfg.cf_access_client_id,
        cf_access_client_secret=cfg.cf_access_client_secret,
    )
    return sdk, session


@dataclass
class _SDKItem:
    """
    Internal container to keep SDK and its session together for lifecycle management.
    """
    sdk: CloudSDK
    session: aiohttp.ClientSession


class SDKPool:
    """
    A simple async pool of CloudSDK instances.

    Use case:
    - Multiple concurrent message handlers need an SDK, but we want to bound concurrency
      and avoid constructing/tearing down SDK + HTTP session for every request.

    Implementation:
    - Pre-create N SDKs on start()
    - Hand out SDKs via an asyncio.Queue
    - Return them to the queue when released
    """
    def __init__(self, size: int) -> None:
        if size < 1:
            raise ValueError("SDKPool size must be >= 1")
        self._items: List[_SDKItem] = []
        self._queue: asyncio.Queue[_SDKItem] = asyncio.Queue()
        self._size = size

    async def start(self) -> None:
        # Create N SDK instances up front and enqueue them as available.
        for _ in range(self._size):
            sdk, session = await _create_sdk_instance()
            item = _SDKItem(sdk=sdk, session=session)
            self._items.append(item)
            self._queue.put_nowait(item)

    async def stop(self) -> None:
        # Close all aiohttp sessions associated with SDKs.
        for item in self._items:
            try:
                await item.session.close()
            except Exception:
                pass
        self._items.clear()

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[CloudSDK]:
        """
        Acquire one SDK from the pool as an async context manager.

        Ensures the SDK is returned to the pool even if the caller raises.
        """
        item = await self._queue.get()
        try:
            yield item.sdk
        finally:
            self._queue.put_nowait(item)


@asynccontextmanager
async def create_sdk_pool(size: int) -> AsyncIterator[SDKPool]:
    """
    Convenience context manager to create/start/stop an SDKPool.

    Example:
        async with create_sdk_pool(4) as pool:
            async with pool.acquire() as sdk:
                ...
    """
    pool = SDKPool(size)
    await pool.start()
    try:
        yield pool
    finally:
        await pool.stop()