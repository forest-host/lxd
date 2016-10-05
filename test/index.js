//import assert from 'assert';

import Promise from 'bluebird';
import fs from 'fs';
import path from 'path';
import chai from 'chai';
import exec from 'utilities';
chai.should();

import lxc from '../lib';

var stat = Promise.promisify(fs.stat);

var name = 'test';
var image = 'test';
var user = 'forest';
var directory = 'dist';
var container_path = '/home/' + user + '/' + directory;

function parse_output(output) {
	return output.stdout.map(line => line.toString().replace('\n', ''));
}

function filter_containers(list) {
	return list.filter(container => container.name == name);
}

describe('LXC Module', () => {

	describe('create', () => {
		it('Creates container', function() {
			this.timeout(30000);
			return lxc.create(image, name)
				.then(() => lxc.list())
				.then(filter_containers)
				.then(list => list.should.have.length(1));
		});
	});

	describe('list', () => {
		it('Lists containers', () => {
			return lxc.list()
				.then(filter_containers)
				.then(list => {
					list.should.have.length(1);
					list[0].name.should.equal(name);
				});
		});
	});

	describe('execute', () => {
		it('Executes command in container', () => {
			var options = {
				cwd: '/',
				user: user,
			};

			return lxc.execute(name, 'hostname', options)
				.then(parse_output)
				.then(lines => lines[0])
				.then(output => output.should.equal(name))
		});
	});

	describe('copy_to', () => {
		var host_path = __dirname.replace('test', directory);

		it('Does not accept relative paths', done => {
			lxc.copy_to(name, '../', container_path)
				.then(() => done(new Error('Relative path accepted')))
				.catch(() => done());
		});

		it('Copies data from host to container', () => {
			return lxc.copy_to(name, host_path, container_path)
				.then(() => lxc.execute(name, 'ls ' + path.dirname(container_path)))
				.then(parse_output)
				.then(lines => lines[0])
				.then(line => line.should.equal(directory));
		});

		it('Errors when host path does not exist', () => {
			return lxc.copy_to(name, '/path/does/not/exist', container_path)
				.then(() => {
					throw new Error();
				})
				.catch(err => err.message.should.contain('not exist'));
		})
	});

	describe('copy_from', () => {
		var host_path = '/tmp/testing';

		it('Errors when container path does not exist', () => {
			return lxc.copy_from(name, '/path/does/not/exist', host_path)
				.then(() => {
					throw new Error();
				})
				.catch(err => err.message.should.contain('not exist'));
		})

		it('Copies data from container to host', () => {
			return lxc.copy_from(name, container_path, host_path)
				.then(() => exec('ls', [host_path]))
				.then(parse_output)
				.then(output => {
					output.should.contain('index.js');
				});
		});

		it('Errors when host path exists', () => {
			return lxc.copy_from(name, container_path, host_path)
				.then(() => {
					throw new Error();
				})
				.catch(err => err.message.should.contain('exists'));
		})

		// Remove tmp dir after
		after(() => {
			return exec('rm', ['-rf', host_path]);
		});
	});

	describe('destroy', () => {
		it('Destroys container', function() {
			this.timeout(5000);
			return lxc.destroy(name)
				.then(() => lxc.list())
				.then(filter_containers)
				.then(list => list.should.have.length(0));
		});
	});

	/*
	// TODO - mount and unmount filesystems to and from container
	describe('mount', () => {
		it('Mounts data volume on container');
	});

	describe('unmount', () => {
		it('Unmounts data volume from container');
	});
	*/
});
