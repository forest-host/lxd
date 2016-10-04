//import assert from 'assert';

import Promise from 'bluebird';
import fs from 'fs';
import path from 'path';
import chai from 'chai';
chai.should();

import lxc from '../lib';

var stat = Promise.promisify(fs.stat);

function clean_output(output) {
	return output.stdout.map(line => line.toString().replace('\n', ''));
}

describe('LXC Module', () => {
	var name = 'test';
	var image = 'test';
	var user = 'forest';
	var directory = 'dist';
	var container_path = '/home/' + user + '/' + directory;

	describe('create', () => {
		it('Creates container', function() {
			this.timeout(30000);
			return lxc.create(image, name)
				.then(() => lxc.list())
				.then(list => list.should.have.length(1));
		});
	});

	describe('list', () => {
		it('Lists containers', () => {
			return lxc.list()
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
				.then(clean_output)
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
				.then(clean_output)
				.then(lines => lines[0])
				.then(line => line.should.equal(directory));
		});
	});

	describe('copy_from', () => {
		var host_path = '/tmp/dist';

		it('Copies data from container to host', () => {
			return lxc.copy_from(name, container_path, host_path)
				.then(() => stat(host_path))
				.then(stats => stats.should.have.property('size'));
				//.then(() => lxc.execute(name, 'ls ' + container_path))
				//.then(clean_output)
				//.then(lines => lines[0])
				//.then(line => line.should.equal(directory));
		});
	});

	describe('destroy', () => {
		it('Destroys container', function() {
			this.timeout(5000);
			return lxc.destroy(name)
				.then(() => lxc.list())
				.then(list => list.should.have.length(0));
		});
	});

	/*
	describe('mount', () => {
		it('Mounts data volume on container');
	});

	describe('unmount', () => {
		it('Unmounts data volume from container');
	});
	*/
});
