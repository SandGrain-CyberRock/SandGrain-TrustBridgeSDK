# Milestone 1: standalone BLE NUS peripheral (Linux/BlueZ over D-Bus).
# Needs libglib2.0-dev (provides pkg-config gio-2.0). No other deps.
CC      ?= cc
CFLAGS  += -Wall -Wextra -O2 -std=c11 $(shell pkg-config --cflags gio-2.0)
LDLIBS  += $(shell pkg-config --libs gio-2.0)

nus_peripheral: nus_peripheral.c
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

clean:
	rm -f nus_peripheral

.PHONY: clean
