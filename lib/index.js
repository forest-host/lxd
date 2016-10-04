
import path from 'path';
import exec from 'utilities';

// Create a new container from image with name
var create = (image, container_name) => {
	return exec('lxc', ['launch', image, container_name]);
};

// Destroy container with name
var destroy = (container_name) => {
	return exec('lxc', ['delete', container_name, '--force']);
};

// Get json list of containers
var list = () => {
	return exec('lxc', ['list', '--format=json'])
		.then(output => output.stdout.map(line => JSON.parse(line.toString())))
		.then(lines => lines[0]);
};

// TODO - support relative paths?
// Copy data from host to container with name
var copy_to = (container_name, host_path, container_path) => {
	// Check for relative paths
	if(host_path.substring(0, 1) == '.' || container_path.substring(0, 1) == '.') {
		return Promise.reject(new Error('This function does not support relative paths'));
	}

	// Get correct container path
	if(container_path.substring(container_path.length - 1) != '/') {
		container_path = path.dirname(container_path) + '/';
	}

	// Setup variables we need
	var dirname = path.dirname(host_path);
	var basename = path.basename(host_path);
	var options = { cwd: dirname };
	var archive = basename + '.tar.gz';

	// Create archive on host
	return exec('tar', ['cfz', archive, basename], options)
		// Push file to container
		.then(() => exec('lxc', ['file', 'push', archive, container_name + '/' + container_path]))
		// Extract archive in container
		.then(() => execute(container_name, 'tar xfz ' + archive, { cwd: container_path }))
		// Remove archive from container
		.then(() => execute(container_name, 'rm ' + archive, { cwd: container_path }))
		// Remove archive from host
		.then(() => exec('rm', [archive], options));
};

// Execute command in container
var execute = (container_name, command, options) => {
	var cmd = '';

	// Catch empty options
	options = options || {};

	// Change to working dir
	if('cwd' in options) {
		cmd += 'cd ' + options.cwd + '; ';
	}

	// Execute command as user
	if('user' in options) {
		cmd += 'sudo -u ' + options.user + ' ';
	}

	// Escape string
	cmd += command;

	// Run all of it in designated container
	return exec('lxc', ['exec', container_name, '--', '/bin/bash', '-c', cmd])
};

export {create};
export {destroy};
export {list};
export {execute};
export {copy_to};

export default {
	create: create,
	destroy: destroy,
	list: list,
	execute: execute,
	copy_to: copy_to,
};
