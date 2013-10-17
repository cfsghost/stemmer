"use strict";

if (process.argv.length < 2) {
	console.log('usage: mkrootfs [Project Name]');
	process.exit();
}

var path = require('path');
var async = require('async');

var Arch = require('../lib/arch');
var Job = require('../lib/job');
var Strap = require('../lib/strap');
var RootfsActivator = require('../lib/rootfs_activator');


var strap = new Strap();

var configPath = null;
var archRootfs = null;
var job = null;
async.series([

	function(next) {

		// Initializing architecture settings
		var arch = new Arch();
		arch.arch = 'cubieboard';
		arch.init(function() {
			strap.settings = arch.settings.repo;
			next();
		});
	},
	function(next) {

		// Create a job
		job = new Job();
		job.create(function() {
			next();
		});
	},
	function(next) {

		// Initializing config for making rootfs
		configPath = path.join(job.jobPath, 'multistrap.conf');
		strap.generateBuildConfig(configPath, function() {
			next();
		});
	},
	function(next) {

		// Starting to make a rootfs
		var targetPath = path.join(job.jobPath, 'rootfs');
		var envConfigPath = path.join(job.jobPath, 'fakeroot.env');

		strap.build(configPath, envConfigPath, targetPath, function(err, rootfs) {
			archRootfs = rootfs;

			next();
		});
	},
	function(next) {

		// Activate rootfs
		var activator = new RootfsActivator(archRootfs);
		activator.configurePackages = true;
		activator.resetRootPassword = true;
		activator.activate(function() {
			next();
		});
	}
], function() {
	console.log('Done');
});
