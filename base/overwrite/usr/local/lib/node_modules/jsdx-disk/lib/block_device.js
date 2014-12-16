"use strict";

var path = require('path');
var async = require('async');

var BlockDevice = module.exports = function(disk) {
	var self = this;

	self._disk = disk;

	// Interfaces
	self.interfaces = {};

	// Properties
	self.objectPath = null;
	self.id = null;
};

BlockDevice.prototype.initInterface = function(interfaceName, callback) {
	var self = this;

	if (self.interfaces[interfaceName]) {
		if (callback)
			process.nextTick(function() {
				callback(null);
			});

		return;
	}

	// Getting interface via system bus
	self._disk.systemBus.getInterface(
		'org.freedesktop.UDisks2',
		self.objectPath,
		interfaceName,
		function(err, iface) {
			if (err) {
				callback(err);
				return;
			}

			self.interfaces[interfaceName] = iface;

			if (callback)
				callback();
		});
};

BlockDevice.prototype.initInterfaces = function(interfaceNames, callback) {
	var self = this;

	async.eachSeries(interfaceNames, function(interfaceName, next) {

		self.initInterface(interfaceName, function() {
			next();
		});

	}, function() {

		if (callback)
			callback();
	});
};

BlockDevice.prototype.getInterface = function(name) {
	return this.interfaces['org.freedesktop.UDisks2.' + name] || null;
};

BlockDevice.prototype.getDrive = function(callback) {
	var self = this;

	var iface = self.getInterface('Block');

	// Get object path of drive
	iface.getProperty('Drive', function(objPath) {

		self._disk.getDrive(path.basename(objPath), function(err, drive) {
			if (callback)
				callback(err, drive);
		});
	});
};

BlockDevice.prototype.partitionTableExists = function(callback) {
	var self = this;

	if (self.interfaces['org.freedesktop.UDisks2.PartitionTable']) {
		process.nextTick(function() {
			callback(true);
		});

		return;
	}

	// TODO: Updating interfaces then check it again.
	process.nextTick(function() {
		callback(false);
	});
		
};

BlockDevice.prototype.getSize = function(callback) {
	var self = this;

	var iface = self.getInterface('Block');
	iface.getProperty('Size', function(size) {
		callback(null, size);
	});
};

BlockDevice.prototype.mount = function() {
	var self = this;

	var opts = null;
	var callback = null;
	if (arguments.length == 1) {
		if (arguments[0] instanceof Function) {
			callback = arguments[0];
			opts = {};
		} else {
			opts = arguments[0];
		}
	} else {
		opts = arguments[0] || {};
		callback = arguments[1] || null;
	}

	// Getting interface
	var iface = self.getInterface('Filesystem');
	if (!iface) {
		if (callback)
			process.nextTick(function() {
				callback(new Error('Invalid filesystem'));
			});

		return;
	}

	iface.Mount['timeout'] = 10000;
	iface.Mount['finish'] = function(mountPath) {

		if (callback)
			callback(null, mountPath);
	};
	iface.Mount(opts || {});
};

BlockDevice.prototype.unmount = function() {
	var self = this;

	var opts = null;
	var callback = null;
	if (arguments.length == 1) {
		if (arguments[0] instanceof Function) {
			callback = arguments[0];
			opts = {};
		} else {
			opts = arguments[0];
		}
	} else {
		opts = arguments[0] || {};
		callback = arguments[1] || null;
	}


	// Getting interface
	var iface = self.getInterface('Filesystem');
	if (!iface) {
		if (callback)
			process.nextTick(function() {
				callback(new Error('Invalid filesystem'));
			});

		return;
	}

	iface.Unmount['timeout'] = 10000;
	iface.Unmount['finish'] = function() {

		if (callback)
			callback(null);
	};
	iface.Unmount(opts || {});
};

BlockDevice.prototype.createPartitionTable = function() {
	var self = this;

	var type = null;
	var opts = null;
	var callback = null;
	if (arguments.length == 0) {

		throw new Error('format method requires argument.');

	}

	type = arguments[0] || 'dos';
	if (arguments.length > 1) {

		if (arguments[1] instanceof Function) {
			opts = {};
			callback = arguments[1];
		} else {
			opts = arguments[1];
			callback = arguments[2] || null;
		}
	}

	// Getting interface
	var iface = self.getInterface('Block');

	// Job handler
	var formatJob = null;
	self._disk.on('JobAdded', function _JobHandler(objectPath, job) {

		if (!job.Objects)
			return;

		// Belongs to this block device
		var hasJob = false;
		for (var index in job.Objects) {
			if (job.Objects[index] == self.objectPath) {
				hasJob = true;
				break;
			}
		}

		if (!hasJob)
			return;

		if (job.Operation == 'format-erase') {
			formatJob = objectPath;

			self._disk.systemBus.getInterface(
				'org.freedesktop.UDisks2',
				'/org/freedesktop/UDisks2/jobs/' + objectPath,
				'org.freedesktop.UDisks2.Job',
				function(err, iface) {

					if (err) {
						if (callback)
							callback(err);

						return;
					}

					iface.once('Completed', function(success, msg) {

						if (callback) {
							if (success)
								callback(null);
							else
								callback(new Error(msg));
						}
					});
				});
		}
	});

	self._disk.on('JobRemoved', function _JobCompleted(objectPath, job) {
		if (formatJob != objectPath)
			return;

		self._disk.removeListener('JobRemoved', _JobCompleted);
		self._disk.removeListener('JobAdded', _JobHandler);
	});

	// Start to format block device
	var _opts = opts || {};
	_opts['no-block'] = true;

	iface.Format['timeout'] = 10000;
	iface.Format(type, _opts);
};

BlockDevice.prototype.format = function() {
	var self = this;

	var fsType = null;
	var opts = null;
	var callback = null;
	if (arguments.length == 0) {

		throw new Error('format method requires argument.');

	}

	fsType = arguments[0];
	if (arguments.length > 1) {

		if (arguments[1] instanceof Function) {
			opts = {};
			callback = arguments[1];
		} else {
			opts = arguments[1];
			callback = arguments[2] || null;
		}
	}

	// Getting interface
	var iface = self.getInterface('Block');

	// Job handler
	var formatJob = null;
	self._disk.on('JobAdded', function _JobHandler(objectPath, job) {

		if (!job.Objects)
			return;

		// Belongs to this block device
		var hasJob = false;
		for (var index in job.Objects) {
			if (job.Objects[index] == self.objectPath) {
				hasJob = true;
				break;
			}
		}

		if (!hasJob)
			return;

		if (job.Operation == 'format-mkfs') {
			formatJob = objectPath;

			self._disk.systemBus.getInterface(
				'org.freedesktop.UDisks2',
				'/org/freedesktop/UDisks2/jobs/' + objectPath,
				'org.freedesktop.UDisks2.Job',
				function(err, iface) {

					if (err) {
						if (callback)
							callback(err);

						return;
					}

					iface.once('Completed', function(success, msg) {

						if (callback) {
							if (success)
								callback(null);
							else
								callback(new Error(msg));
						}
					});
				});
		}
	});

	self._disk.on('JobRemoved', function _JobCompleted(objectPath, job) {
		if (formatJob != objectPath)
			return;

		self._disk.removeListener('JobRemoved', _JobCompleted);
		self._disk.removeListener('JobAdded', _JobHandler);
	});

	// Start to format block device
	var _opts = opts || {};
	_opts['no-block'] = true;

	iface.Format['timeout'] = 10000;
	iface.Format(fsType, _opts);

};

BlockDevice.prototype.createPartition = function(offset, size, type, name, opts, callback) {
	var self = this;

	var defOffset = 1048576;
	var defType = '0x83';

	// Getting interface
	var iface = self.getInterface('PartitionTable');
	if (!iface) {
		if (callback)
			process.nextTick(function() {
				callback(new Error('Such device doens\'t have partition table.'));
			});

		return;
	}

	iface.CreatePartition['timeout'] = 30000;
	iface.CreatePartition['finish'] = function() {

		if (callback)
			callback(null);
	};
	iface.CreatePartition(offset, size, type, name || '', opts);
};

BlockDevice.prototype.deletePartition = function() {
	var self = this;

	var opts = null;
	var callback = null;
	if (arguments.length == 1) {
		if (arguments[0] instanceof Function) {
			callback = arguments[0];
			opts = {};
		} else {
			opts = arguments[0];
		}
	} else {
		opts = arguments[0] || {};
		callback = arguments[1] || null;
	}

	// Getting interface
	var iface = self.getInterface('Partition');
	if (!iface) {
		if (callback)
			process.nextTick(function() {
				callback(new Error('Doesn\'t support deletePartition()'));
			});

		return;
	}

	iface.Delete['timeout'] = 30000;
	iface.Delete['finish'] = function() {

		if (callback)
			callback(null);
	};
	iface.Delete(opts);
};
