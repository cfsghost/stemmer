"use strict";

var util = require('util');
var events = require('events');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var async = require('async');

var RootfsExecuter = require('./rootfs_executer');

var Rootfs = module.exports = function() {
	var self = this;

	self.arch = null;
	self.targetPath = null;
	self.initialDirPath = null;
	self.environmentReady = false;
};

util.inherits(Rootfs, events.EventEmitter);

Rootfs.prototype.clone = function(targetPath, callback) {
	var self = this;

	var rootfs = null;
	async.series([
		function(next) {

			fs.exists(self.targetPath, function(exists) {
				if (!exists) {
					next(new Error('No such rootfs.'));
					return;
				}

				next();
			});
		},
		function(next) {

			fs.exists(targetPath, function(exists) {
				if (!exists) {
					fs.mkdir(targetPath, function(err) {
						next(err);
					});
					return;
				}

				next();
			});
		},
		function(next) {

			fs.readdir(self.targetPath, function(err, files) {
				if (err) {
					next(err);
					return;
				}

				if (files.length == 0) {
					next(new Error('No such rootfs.'));
					return;
				}

				// Preparing entries
				var sources = [];
				for (var index in files) {
					sources.push(path.join(self.targetPath, files[index]));
				}

				// Arguments
				var args = [ '-a' ].concat(sources, [ targetPath ]);

				// Copying files
				var cmd = child_process.spawn('cp', args);
				cmd.on('close', function() {

					// Creatinga  new rootfs object
					rootfs = new Rootfs();
					rootfs.arch = self.arch;
					rootfs.targetPath = targetPath;

					next();
				});
			});
		}
	], function(err) {
		callback(err, rootfs);
	});
};

Rootfs.prototype.move = function(targetPath, callback) {
	var self = this;

	fs.exists(self.targetPath, function(exists) {
		if (!exists) {
			callback(new Error('No such rootfs.'));
			return;
		}

		fs.readdir(self.targetPath, function(err, files) {

			if (files.length == 0) {
				callback();
				return;
			}

			// Preparing entries
			var sources = [];
			for (var index in files) {
				sources.push(path.join(self.targetPath, files[index]));
			}

			// Arguments
			var args = [ '-f' ].concat(sources, [ targetPath ]);

			var cmd = child_process.spawn('mv', args);
			cmd.on('close', function() {
				self.targetPath = targetPath;
				callback();
			});
		});
	});
};

Rootfs.prototype.remove = function(callback) {
	var self = this;

	if (!self.targetPath) {
		process.nextTick(callback);
		return;
	}

	var cmd = child_process.spawn('rm', [
		'-fr',
		self.targetPath
	]);

	cmd.on('close', function() {
		callback();
	});
};

Rootfs.prototype.addRepository = function(name, source, suite, components, keyring, callback) {
	var self = this;

	var sourceSet = [
		'deb',
		source,
		suite,
		components.join(' ')
	];

	fs.writeFile(path.join(self.targetPath, 'etc', 'apt', 'sources.list.d', name + '.list'), sourceSet.join(' ') + '\n', function(err) {
		callback(err);
	});
};

Rootfs.prototype.clearRepositories = function(callback) {
	var self = this;

	var repoPath = path.join(self.targetPath, 'etc', 'apt', 'sources.list.d');

	fs.readdir(repoPath, function(err, files) {

		async.each(files, function(filename, cb) {
			fs.unlink(path.join(repoPath, filename), cb);
		}, function() {
			callback();
		});
	});
};

Rootfs.prototype.removeRepository = function(name, callback) {
	var self = this;

	fs.unlink(path.join(self.targetPath, 'etc', 'apt', 'sources.list.d', name + '.list'), function() {
		callback();
	});
};

Rootfs.prototype.applyOverwrite = function(sourcePath, callback) {
	var self = this;

	fs.exists(sourcePath, function(exists) {

		if (!exists) {
			// Target director doesn't exist
			callback(null);
			return;
		}

		// Overwriting files
		fs.readdir(sourcePath, function(err, files) {
			if (err) {
				callback(err);
				return;
			}

			if (files.length == 0) {
				callback(null);
				return;
			}

			var sources = [];
			for (var index in files) {
				sources.push(path.join(sourcePath, files[index]));
			}

			var args = [ '-a' ].concat(sources, [ self.targetPath ]);

			var cmd = child_process.spawn('cp', args);

//			cmd.stdout.pipe(process.stdout);
//			cmd.stderr.pipe(process.stderr);

			cmd.on('close', function() {
				callback(null);
			});
		});
	});
};

Rootfs.prototype.prepareEnvironment = function(callback) {
	var self = this;

	if (self.environmentReady) {
		process.nextTick(callback);
		return;
	}

	async.series([

		function(next) {

			// Initializing domain name server settings
			var cmd = child_process.spawn('cp', [
				'-a',
				path.join('/', 'etc', 'resolv.conf'),
				path.join(self.targetPath, 'etc')
			]);

			cmd.on('close', function() {
				next();
			});
		},
		function(next) {

			if (self.arch == 'armhf') {
				// Preparing emulator
				var cmd = child_process.spawn('cp', [
					'-a',
					path.join('/', 'usr', 'bin', 'qemu-arm-static'),
					path.join(self.targetPath, 'usr', 'bin')
				]);

				cmd.on('close', function() {
					next();
				});

				return;
			}

			next();
		},
		function(next) {

			// Setting proxy to speed up apt-get
			var proxyConfig = 'Acquire::http::Proxy "http://127.0.0.1:3142/apt-cacher/";';

			fs.writeFile(path.join(self.targetPath, 'etc', 'apt', 'apt.conf.d', '01stemmer'), proxyConfig, function(err) {
				next(err);
			});

		},
		function(next) {

			// Setting local repository
			var repo = 'deb file:/.stemmer/packages ./';

			fs.writeFile(path.join(self.targetPath, 'etc', 'apt', 'sources.list.d', 'stemmer.list'), repo, function(err) {
				next(err);
			});

		},
		function(next) {

			var stemmerPath = path.join(self.targetPath, '.stemmer');
			async.series([
				function(_next) {
					fs.exists(stemmerPath, function(exists) {
						if (exists) {
							self.initialDirPath = stemmerPath;
							next();
							return;
						}

						fs.mkdir(stemmerPath, function(err) {
							if (err) {
								_next(err);
								return;
							}

							self.initialDirPath = stemmerPath;
							_next();

						});
					});
				},
				function(_next) {

					fs.mkdir(path.join(stemmerPath, 'packages'), function(err) {
						if (err) {
							_next(err);
							return;
						}

						_next();

					});
				},
				function(_next) {

					// Generate package list for local repository
					self.applyPackages({}, function(err) {
						if (err) {
							_next(err);
							return;
						}

						_next();

					});
				},
				function(_next) {


					// Initializing a fake environment to avoid invoke-rc.d running
					var fakeLinks = [
						'initctl',
						'invoke-rc.d',
						'restart',
						'start',
						'stop',
						'start-stop-daemon',
						'service'
					];

					async.each(fakeLinks, function(linkname, cb) {
						fs.symlink('/bin/true', path.join(stemmerPath, linkname), function(err) {
							cb(err);
						});
					}, function(err) {

						_next(err);
					});
				}
			], function(err) {
				next(err);
			})
			
		}
	], function(err) {
		if (err) {
			self.clearEnvironment(function() {
				callback(err);
			});

			return;
		}

		self.environmentReady = true;
		callback(null);
	});
};

Rootfs.prototype.clearEnvironment = function(callback) {
	var self = this;

	if (!self.environmentReady) {
		process.nextTick(callback);
		return;
	}

	async.series([

		function(next) {

			self.emit('clear', 'packages');

			// Clear APT stuffs
			var rootfsExecuter = new RootfsExecuter(self);
			rootfsExecuter.addCommand('rm -fr /var/lib/apt/lists/*');
			rootfsExecuter.addCommand('apt-get clean');
			rootfsExecuter.addCommand('rm -fr /var/lib/dpkg/available-old');
			rootfsExecuter.addCommand('rm -fr /var/lib/dpkg/diversions-old');
			rootfsExecuter.addCommand('rm -fr /var/lib/dpkg/status-old');
			rootfsExecuter.run({}, function() {
				next();
			});
		},
		function(next) {

			self.emit('clear', 'apt_settings');

			fs.unlink(path.join(self.targetPath, 'etc', 'apt', 'apt.conf.d', '01stemmer'), next);
		},
		function(next) {

			fs.unlink(path.join(self.targetPath, 'etc', 'apt', 'sources.list.d', 'stemmer.list'), next);
		},
		function(next) {

			self.emit('clear', 'initial_directory');

			var cmd = child_process.spawn('rm', [
				'-fr',
				self.initialDirPath
			]);

			cmd.on('close', function() {
				self.initialDirPath = null;
				next();
			});
		},
		function(next) {

			self.emit('clear', 'emulator');

			fs.unlink(path.join(self.targetPath, 'usr', 'bin', 'qemu-arm-static'), next);
		},
		function(next) {

			self.emit('clear', 'dns_settings');

			fs.unlink(path.join(self.targetPath, 'etc', 'resolv.conf'), next);
		}
	], function() {
		self.environmentReady = false;
		callback();
	});
};

Rootfs.prototype.setPackageIndexes = function(indexPath, callback) {
	var self = this;

	var rootfsExecuter = new RootfsExecuter(self);

	var outputPath = path.join(self.targetPath, 'var', 'lib', 'apt', 'lists');

	fs.readdir(indexPath, function(err, files) {
		if (err) {
			callback(err);
			return;
		}

		if (files.length == 0) {
			callback();
			return;
		}

		var filelist = [];

		// Finding index files
		async.each(files, function(filename, next) {

			filelist.push(path.join(indexPath, filename));

			next();

		}, function() {

			// Copying index files
			var args = [ '-a' ].concat(filelist, [ outputPath ]);
			var cmd = child_process.spawn('cp', args);
			cmd.on('close', function() {

				// Update package index
				var rootfsExecuter = new RootfsExecuter(self);
				rootfsExecuter.addCommand('apt-get update');
				rootfsExecuter.run({}, function() {
					callback(null);
				});
			});
		})
	});

};

Rootfs.prototype.fetchPackageIndexes = function(outputPath, callback) {
	var self = this;

	var rootfsExecuter = new RootfsExecuter(self);

	var sourceDirPath = path.join(self.targetPath, 'var', 'lib', 'apt', 'lists');

	fs.readdir(sourceDirPath, function(err, files) {
		if (err) {
			callback(err);
			return;
		}

		if (files.length == 0) {
			callback();
			return;
		}

		var filelist = [];

		// Finding index files
		async.each(files, function(filename, next) {
			if (/_Packages$/.test(filename) ||
				/_Translation-en$/.test(filename) ||
				/_InRelease$/.test(filename) ||
				/_Sources$/.test(filename) ||
				/_Release$/.test(filename)) {

				// Ignore stemmer local repos
				if (filename != '_.stemmer_packages_._Packages')
					filelist.push(path.join(sourceDirPath, filename));
			}

			next();

		}, function() {

			// Copying index files
			var args = [ '-a' ].concat(filelist, [ outputPath ]);
			var cmd = child_process.spawn('cp', args);
			cmd.on('close', function() {

				callback(null);
			});
		})
	});

};

Rootfs.prototype.registerServices = function(services, opts, callback) {
	var self = this;

	if (Object.keys(services).length == 0) {
		process.nextTick(function() {
			callback(null);
		});
		return;
	}

	var rootfsExecuter = new RootfsExecuter(self);

	for (var name in services) {
		rootfsExecuter.addCommand('insserv -v -d /etc/init.d/' + name);
	}

	rootfsExecuter.run({}, function() {
		callback(null);
	});
};

Rootfs.prototype.installPackages = function(packages, opts, callback) {
	var self = this;

	if (Object.keys(packages).length == 0) {
		process.nextTick(function() {
			callback(null);
		});
		return;
	}

	var pkgs = [];
	for (var name in packages) {
		var version = packages[name];
		if (version == '*' || version == '')
			pkgs.push(name);
		else
			pkgs.push(name + '=' + version);
	}

	var rootfsExecuter = new RootfsExecuter(self);

	// Specify suite
	if (opts.suite)
		rootfsExecuter.addCommand('apt-get install -f --no-install-recommends -q --force-yes -y -t ' + opts.suite + ' ' + pkgs.join(' '));
	else
		rootfsExecuter.addCommand('apt-get install -f --no-install-recommends -q --force-yes -y ' + pkgs.join(' '));

	rootfsExecuter.run({}, function() {
		callback(null);
	});

};

Rootfs.prototype.applyPackages = function(opts, callback) {
	var self = this;

	// TODO: check Packages.gz and remove it if it doesn't exist
	var failed = false;
	var dpkg = child_process.spawn('dpkg-scanpackages', [
		'.',
		'/dev/null'
	], {
		cwd: path.join(self.targetPath, '.stemmer', 'packages')
	});

	var gzip = child_process.spawn('gzip', [
		'-9c'
	]);

	dpkg.stdout.on('data', function(data) {
		gzip.stdin.write(data);
	});

	dpkg.on('close', function() {
		gzip.stdin.end();
	});

	var packageListFile = path.join(self.targetPath, '.stemmer', 'packages', 'Packages.gz');
	gzip.stdout.on('data', function(data) {

		fs.appendFile(packageListFile, data, function(err) {
			if (err) {
				callback(err);
				failed = true;
			}
		});
	});

	gzip.on('close', function() {
		if (!failed)
			callback();
	});

};

Rootfs.prototype.addUsers = function(users, opts, callback) {
	var self = this;

	if (Object.keys(users).length == 0) {
		process.nextTick(function() {
			callback(null);
		});
		return;
	}

	var rootfsExecuter = new RootfsExecuter(self);

	for (var username in users) {

		if (username != 'root')
			rootfsExecuter.addCommand('useradd ' + username);
		else {
			// Reset root password
			rootfsExecuter.addCommand('passwd -d ' + username);
		}

		if (users[username].password) {
			if (users[username].password != '') {
				rootfsExecuter.addCommand('echo -e \"' + users[username].password + '\n' + users[username].password + '\" | passwd ' + username);
				continue;
			}
		}

		// No need to reset again for root
		if (username == 'root')
			continue;

		// Do not set password
		rootfsExecuter.addCommand('passwd -d ' + username);
	}

	rootfsExecuter.run({}, function() {
		callback(null);
	});
};
