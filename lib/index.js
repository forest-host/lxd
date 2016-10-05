
import Promise from 'bluebird';
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

// Check if paths are not relative
var validate_paths = (host_path, container_path) => {
	if(host_path.substring(0, 1) == '.' || container_path.substring(0, 1) == '.') {
		return Promise.reject(new Error('This function does not support relative paths'));
	} else {
		return Promise.resolve();
	}
}

// TODO - support relative paths?
// Copy data from host to container with name
var copy_to = (container_name, host_path, container_path) => {
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
				host_path_exists(host_path),
				container_path_not_exists(container_name, container_path + container_basename),
			])

				// Create archive on host
				.then(() => exec('tar', ['cfz', archive, host_basename], host_options))

				// Push file to container
				.then(() => exec('lxc', ['file', 'push', archive, container_name + '/' + container_path], host_options))

				// Extract archive in container and move it to desired path when required
				.then(() => execute(container_name, 'tar xfz ' + archive, container_options))
				.then(() => {
					if(host_basename != container_basename) {
						return execute(container_name, 'mv ' + host_basename + ' ' + container_basename, container_options);
					}
				})

				// Remove archive from container and from host
				.then(() => execute(container_name, 'rm ' + archive, container_options))
				.then(() => exec('rm', [archive], host_options));
		});
};

// Check if path exists in container
var container_path_exists = (container_name, path) => {
	return execute(container_name, 'stat ' + path)
		.catch(() => {
			throw new Error('Path ' + path + ' in container does not exist');
		});
};

// Check if path exists on host
var host_path_exists = (path) => {
	return exec('stat', [path])
		.catch(() => {
			throw new Error('Path ' + path + ' on host does not exist');
		});
};

// Check if container path does not exist
var container_path_not_exists = (container_name, path) => {
	return new Promise((resolve, reject) => {
		execute(container_name, 'stat ' + path)
			.then(() => reject(new Error('Path ' + path + ' on container exists')))
			.catch(() => resolve());
	});
}

// Check if host path does not exist
var host_path_not_exists = (path) => {
	return new Promise((resolve, reject) => {
		exec('stat', [path])
			.then(() => reject(new Error('Path ' + path + ' on host exists')))
			.catch(() => resolve());
	});
};

// Copy data from container to host
var copy_from = (container_name, container_path, host_path) => {
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
				host_path_not_exists(host_path + host_basename),
				container_path_exists(container_name, dirname + '/' + container_basename)
			])

				// Create archive in container
				.then(() => execute(container_name, 'tar cfz ' + archive + ' ' + container_basename, options))

				// Copy archive to host
				.then(() => exec('lxc', ['file', 'pull', container_name + '/' + dirname + '/' + archive, host_path]))

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
				.then(() => execute(container_name, 'rm ' + archive, options));
		});
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
export {copy_from};

export default {
	create: create,
	destroy: destroy,
	list: list,
	execute: execute,
	copy_to: copy_to,
	copy_from: copy_from,
};
