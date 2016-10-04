//import assert from 'assert';

import chai from 'chai';
chai.should();

import lxc from '../lib';

describe('LXC Module', () => {
	var name = 'test';
	var image = 'base';

	// TODO set / unset config?
	// TODO list containers?
	//describe('create', () => {
		//it('Creates container', function() {
			//this.timeout(30000);
			//return lxc.create(image, name);
		//});
	//});

	//describe('destroy', () => {
		//it('Destroys container', function() {
			//this.timeout(5000);
			//return lxc.destroy(name);
		//});
	//});

	describe('list', () => {
		it('Lists containers', () => {
			return lxc.list()
				.then(list => {
					list.should.have.length(1);
				});
		});
	});

	describe('copy_to', () => {
		it('Copies data from host to container');
	});

	describe('copy_from', () => {
		it('Copies data from container to host');
	});

	describe('mount', () => {
		it('Mounts data volume on container');
	});

	describe('unmount', () => {
		it('Unmounts data volume from container');
	});

	describe('execute', () => {
		it('Executes command in container');
	});
});
