export const TRACE_LOG_QUEUE = "trace-log";
export const TRACE_LOG_FLUSH_JOB = "flush-trace-logs";
export const TRACE_LOG_SCHEDULER_JOB_ID = "trace-log-flush-scheduler";
export const TRACE_LOG_BUFFER_KEY = "trace-log:buffer";

export const TRACE_LOG_FLUSH_INTERVAL_MS = 30 * 1000;
export const TRACE_LOG_BATCH_SIZE = 500;
export const TRACE_LOG_BUFFER_HARD_CAP = 50_000;

export const POP_BATCH_SCRIPT = `
local vals = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
if #vals > 0 then
    redis.call('LTRIM', KEYS[1], #vals, -1)
end
return vals
`;