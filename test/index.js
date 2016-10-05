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
var image = 'builder';
var directory = 'dist';
var container_path = '/var/dist';
var mount = '/var/forest/mounts/builds';

function parse_output(output) {
	return output.stdout.map(line => line.toString());
}

function split_newlines(output) {
	return output[0].split('\n');
}

function filter_containers(list) {
	return list.filter(container => container.name == name);
}

describe('LXC Module', () => {
	var container;
	
	describe('create', () => {
		it('Creates container', function() {
			this.timeout(30000);
			return lxc.create(image, name)
				.then(obj => {
					container = obj;
					return lxc.list();
				})
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

	describe('exec', () => {
		it('Executes command in container', () => {
			return container.exec('hostname')
				.then(parse_output)
				.then(lines => lines[0].replace('\n', ''))
				.then(output => output.should.equal(name))
		});
	});

	describe('upload', () => {
		var host_path = __dirname.replace('test', directory);

		it('Does not accept relative paths', done => {
			container.upload('../', container_path)
				.then(() => done(new Error('Relative path accepted')))
				.catch(() => done());
		});

		it('Copies data from host to container', () => {
			return container.upload(host_path, container_path)
				.then(() => container.exec('ls', [path.dirname(container_path)]))
				.then(parse_output)
				.then(split_newlines)
				.then(lines => lines.should.contain(directory));
		});

		it('Errors when host path does not exist', () => {
			return container.upload('/path/does/not/exist', container_path)
				.then(() => {
					throw new Error();
				})
				.catch(err => err.message.should.contain('not exist'));
		})
	});

	describe('download', () => {
		var host_path = '/tmp/testing';

		it('Errors when container path does not exist', () => {
			return container.download('/path/does/not/exist', host_path)
				.then(() => {
					throw new Error();
				})
				.catch(err => err.message.should.contain('not exist'));
		})

		it('Copies data from container to host', () => {
			return container.download(container_path, host_path)
				.then(() => exec('ls', [host_path]))
				.then(parse_output)
				.then(split_newlines)
				.then(output => {
					output.should.contain('index.js');
				});
		});

		it('Errors when host path exists', () => {
			return container.download(container_path, host_path)
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

	// Mount a share on container
	describe('mount', () => {
		var filename = 'test_mount'

		it('Mounts data volume on container', () => {
			return container.add_disk('test', mount, '/var/forest')
				.then(() => container.exec('touch', ['/var/forest/'+filename]))
				.then(() => stat(mount+'/'+filename))
				.then(() => exec('rm', [mount+'/'+filename]));
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
	describe('unmount', () => {
		it('Unmounts data volume from container');
	});
	*/
});
