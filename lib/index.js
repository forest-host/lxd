
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

// Copy data from host to container with name
var copy_to = (container_name, host_path, container_path) => {
	return exec('tar', ['cfz'])
};

// Execute command in container
var execute = (container_name, command, cwd, user) => {
	var cmd = '';

	if(typeof(cwd) !== 'undefined') {
		cmd += 'cd ' + cwd + '; ';
	}

	if(typeof(user) !== 'undefined') {
		cmd += 'sudo -u ' + user + ' ';
	}

	cmd += escape(command);

	return exec('lxc', ['exec', container_name, '--', '/bin/bash', '-c', command])
};

export {create};
export {destroy};
export {list};
export {execute};

export default {
	create: create,
	destroy: destroy,
	list: list,
	execute: execute,
};
