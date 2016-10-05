
import Promise from 'bluebird';
import exec from 'utilities';
import path from 'path';

// Check if paths are not relative
var validate_paths = (host_path, container_path) => {
	if(host_path.substring(0, 1) == '.' || container_path.substring(0, 1) == '.') {
		return Promise.reject(new Error('This function does not support relative paths'));
	} else {
		return Promise.resolve();
	}
}

var Container = function(host, name) {
	this.host = host;
	this.name = name;
};

// Execute command in container
Container.prototype.exec = function(cmd, options) {
	var command = '';

	// Catch empty options
	options = options || {};

	// Change to working dir
	if('cwd' in options) {
		command += 'cd ' + options.cwd + '; ';
	}

	// Escape string
	command += cmd;

	// Run all of it in designated container
	return exec('lxc', ['exec', this.name, '--', '/bin/bash', '-c', command])
};

// Copy data from container to host
Container.prototype.download = function(container_path, host_path) {
	// Check for relative paths
	return validate_paths(host_path, container_path)
		.then(() => {
			var container_basename = path.basename(container_path);
			var host_basename = container_basename;

			// Get correct host path
			if(host_path.substring(host_path.length - 1) != '/') {
				host_basename = path.basename(host_path);
				host_path = path.dirname(host_path) + '/';
			}

			// Setup vars
			var dirname = path.dirname(container_path);
			var options = { cwd: dirname };
			var archive = container_basename + '.tar.gz';

			// Check if paths are valid
			return Promise.all([
				this.host.path_lacks(host_path + host_basename),
				this.path_exists(dirname + '/' + container_basename)
			])

				// Create archive in container
				.then(() => this.exec('tar cfz ' + archive + ' ' + container_basename, options))

				// Make sure target exists & copy archive to host
				.then(() => exec('mkdir', ['-p', host_path]))
				.then(() => exec('lxc', ['file', 'pull', this.name + '/' + dirname + '/' + archive, host_path]))

				// Extract archive on host & rename it if needed
				.then(() => exec('tar', ['xfz', archive], { cwd: host_path }))
				.then(() => {
					if(host_basename != container_basename) {
						// TODO name conflicts? Rename on container?
						return exec('mv', [container_basename, host_basename], { cwd: host_path })
					}
				})

				// Remove archive on host & remove archive in container
				.then(() => exec('rm', [archive], { cwd: host_path }))
				.then(() => this.exec('rm ' + archive, options));
		});
};

// TODO - support relative paths?
// Copy data from host to container with name
Container.prototype.upload = function(host_path, container_path) {
	// Check for relative paths
	return validate_paths(host_path, container_path)
		.then(() => {
			// Setup names of directories and archive
			var host_basename = path.basename(host_path);
			var container_basename = host_basename;
			var archive = host_basename + '.tar.gz';

			// Get correct container path
			if(container_path.substring(container_path.length - 1) != '/') {
				container_basename = path.basename(container_path);
				container_path = path.dirname(container_path) + '/';
			}

			// Setup working dirs for host and container
			var host_options = { cwd: path.dirname(host_path) };
			var container_options = { cwd: container_path };

			return Promise.all([
				this.host.path_exists(host_path),
				this.path_lacks(container_path + container_basename),
			])

				// Create archive on host
				.then(() => exec('tar', ['cfz', archive, host_basename], host_options))

				// Push file to container
				.then(() => exec('lxc', ['file', 'push', archive, this.name + '/' + container_path], host_options))

				// Extract archive in container and move it to desired path when required
				.then(() => this.exec('tar xfz ' + archive, container_options))
				.then(() => {
					if(host_basename != container_basename) {
						return this.exec('mv ' + host_basename + ' ' + container_basename, container_options);
					}
				})

				// Remove archive from container and from host
				.then(() => this.exec('rm ' + archive, container_options))
				.then(() => exec('rm', [archive], host_options));
		});
};

// Check if path exists in container
Container.prototype.path_exists = function(path) {
	return this.exec('stat ' + path)
		.catch(() => {
			throw new Error('Path ' + path + ' in container does not exist');
		});
};

// Check if container path does not exist
Container.prototype.path_lacks = function(path) {
	return new Promise((resolve, reject) => {
		this.exec('stat ' + path)
			.then(() => reject(new Error('Path ' + path + ' on container exists')))
			.catch(() => resolve());
	});
};

// Add mount
Container.prototype.add_disk = function(name, source, path) {
	return exec('lxc', ['config', 'device', 'add', this.name, name, 'disk', 'source='+source, 'path='+path]);
};

Container.prototype.remove_disk = function(name) {

};

module.exports = Container;
