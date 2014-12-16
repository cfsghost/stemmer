stemmer
=

Build system for Stem OS

Installation
-

Install dependencies via apt-get on Debian:

	apt-get install multistrap qemu-user-static dpkg-dev apt-cacher

Install Node.js modules via NPM:

	cd bin
	npm install async node-uuid colors

Usage
-

Build a rootfs for specific project:

	sudo ./bin/build [Project Name]

Build a rootfs for specific platform or architecture:

	sudo ./bin/mkrootfs [Platform]
