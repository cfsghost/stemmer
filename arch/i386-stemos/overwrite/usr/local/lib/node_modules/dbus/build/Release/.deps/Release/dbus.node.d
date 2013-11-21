cmd_Release/dbus.node := ln -f "Release/obj.target/dbus.node" "Release/dbus.node" 2>/dev/null || (rm -rf "Release/dbus.node" && cp -af "Release/obj.target/dbus.node" "Release/dbus.node")
