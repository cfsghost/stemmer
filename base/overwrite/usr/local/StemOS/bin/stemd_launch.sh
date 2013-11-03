#!/bin/bash

## run the dbus-launch and store the session info in /var/run/dbus-launch.info
DBUSROOT=/var/run
dbus-launch --auto-syntax > $DBUSROOT/dbus-launch.info
source $DBUSROOT/dbus-launch.info

## run the stem daemon
export NODE_PATH=/usr/local/lib/node_modules
export PATH=$PATH:/usr/local/bin
node /usr/local/lib/node_modules/stem-daemon/bin/stemd

