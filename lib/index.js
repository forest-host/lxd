
import Promise from 'bluebird';
import exec from 'utilities';

import Container from './container';

var Client = function() {};

// Create and start a new container from image with name
Client.prototype.launch = function(image, name) {
	return exec('lxc', ['launch', image, name])
		.then(() => new Container(this, name));
};

// Destroy container with name
Client.prototype.destroy = function(name) {
	return exec('lxc', ['delete', name, '--force']);
};

// Get json list of containers
Client.prototype.list = function() {
	return exec('lxc', ['list', '--format=json'])
		.then(output => output.stdout.map(line => JSON.parse(line.toString())))
		.then(lines => lines[0]);
};

// Check if path exists on host
Client.prototype.path_exists = function(path) {
	return exec('stat', [path])
		.catch(() => {
			throw new Error('Path ' + path + ' on host does not exist');
		});
};

// Check if host path does not exist
Client.prototype.path_lacks = function(path) {
	return new Promise((resolve, reject) => {
		exec('stat', [path])
			.then(() => reject(new Error('Path ' + path + ' on host exists')))
			.catch(() => resolve());
	});
};

module.exports = new Client();
