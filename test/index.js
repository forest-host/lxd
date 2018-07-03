
import Promise from 'bluebird';
import fs from 'fs';
import extend from 'extend';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.should();
chai.use(chaiAsPromised);

import LXC from '../lib';

var config = {
	client: {
		key: '/home/johan/.config/lxc/client.key',
		cert: '/home/johan/.config/lxc/client.crt',
		port: '8443',
		host: '127.0.0.1',
	},
	container: {
		name: 'test',
		image: 'application-php',
		mount: {
			source: '/var',
			path: '/host_var',
			name: 'test',
		},
		upload_string: {
			source: 'this is an uploaded string',
			path: '/uploaded_string.txt',
		},
		upload: {
			source: __dirname + '/transfer.txt',
			path: '/uploaded.txt',
		},
		download: {
			source: '/uploaded.txt',
			path: __dirname + '/downloaded.txt',
		},
	},
};

var lxc = new LXC(config.client);
var container = lxc.get_container(config.container.name);

describe('LXC Client', () => {
	it('Throws an error when wrongly configured', () => {
		new LXC(extend({}, config.client, { host: '10.0.0.5' })).list().should.be.rejected;
	});

	it('Returns results when rightly configured', () => {
		new LXC(config.client).list().should.not.be.rejected;
	});

	describe('get_container()', () => {
		it('Returns container instance', () => {
			container.should.be.a('object');
		});
	});

	describe('list()', () => {
		it('Responds with a array', () => {
			lxc.list().should.eventually.be.a('array');
		});
	});

	describe('launch()', () => {
		it('Creates container', function() {
			this.timeout(20000);

			return lxc.get_container(config.container.name).launch(config.container.image)
				.then(container => container.get_state())
				.should.eventually.have.property('status').that.equals('Running')
		});
	});
});

describe('Container', () => {
	describe('wait_for_dhcp()', () => {
		it('Returns address after dhcp is done', function() {
			this.timeout(40000);

			return container.wait_for_dhcp()
				.then(() => container.get_ipv4_addresses())
				.should.eventually.have.length(1);
		});
	});

	describe('get_info()', () => {
		it('Returns config of container', () => {
			return container.get_info()
				.then(config => config.should.have.property('name'));
		});
	});

	describe('get_state()', () => {
		it('returns state of container', () => {
			return container.get_state()
				.then(state => state.status.should.equal('Running'));
		});
	});

	describe('exec()', () => {
		it('Executes command in container', function() {
			this.timeout(10000);

			return container.exec('hostname')
				.then(obj => obj.stdout[0])
				// TODO returns object
				.should.eventually.contain(config.container.name);
		});

		it('Rejects promise for bad command', () => {
			return container.exec('rm', ['/not/existing/directory'])
				.then(obj => obj.status)
				.should.eventually.equal(1);
		});

		it('Correctly handles multiline variables', () => {
			var key = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAsNoVoxT3QtvNXgXFMRXQTB/eCbrgMfYQ06nbMt2hyuVR7Ks3
Q3lkg5F4q4b2OCyA/a9KHQZ5XLXOoML/6lezLvNTOPLLRUXlVeyPeKVS/5CYwiPc
dSuF7LCETFHVXu3HMS5c5q9fld0ppdUKwEFbnsOQ7NRrTbURK0aIj01JmbNtxveC
04QbYSz5dF1bqrE6FAXecfAW3/1PTzh34peso2OwghiYESyje8BUhC3lzRMFkMES
a9fPArrSDFwaytBQAkF/dMpin/hvwN8dZRieIbDKV52LXIyNlakXTSdqXfwP6q9X
FCEJz+J+PtheX75NZ0zJbfgLUg5HRzF/NfpQDwIDAQABAoIBAAt1Na2pMBPe1cFf
slTpyuMDtYj/2IKkJJbyDEeRYGgaz2H7/cqbVM3JYP4L8mvVRk4pSy3yO26sQMTd
nWL7Z5qFHUE1ScIlMySL/Qed/nCcV6lMVX4p4bViAlBHhQFvelZPYKl5d0HoYEhk
Mxwdn+f7V6pgYMtaDdC18ycFpN0WTVA1x1AUboIGbt2S7ZrkY3CKIWW71PNFPKMk
5J2gM+GDTb14ZIJDWrgzCtQ8caQvYvE62uWDNv1jJ6F/h4rgKJKNbRruay/vGmYK
Z0dcPYcsoimb4Q9DhtVwxfSXaW3ZLFf06FJnhLhhDPP2N9CygQzITAlR7c4ml2w9
pqw7OuECgYEA3cHOgUhDmcpofvXQGNcIvTt99ZbrGm+MK8nK7idzDFWK26Zz4AcC
8K6pQAyp6fy6KR2pFnQZn3U5FAdd0grxntDmr2OIa0XIxo+BzwQi9DBTltYDiqpt
S5yc1gZMmw5xnmd2DGA36l2g8tmYYEvlrsC7yb8gaNpIUtbM0n0/DbkCgYEAzCkm
JAofMIdlhm6GzIttvkRb5nO5s0x/Ic9fzk/k/M8pjBlf3d0Sm44o3UhpOKu/h+IL
Evol25cGM+lPQQH3zpKLq4JGDxYJ5eXzeXEGu7Q33DBTTNYFU4UR1pkhl2eALqQR
XJc4o/lx0YOv6HAS4IhW0+8doErkXiQej21AcAcCgYAh5dhNRuCeh6RFlAnFYkmB
s7BjdDhoCBkjMGuG0Bz0C7d4MA+SdT/rzqcslUL785f5ZQFN311zVJXvC9k5nFam
8kPxF4Po8ffo8lLjdDxrm1+LtRdBgR/H6R7IUJoxMZoInsQazDJ/7uQFe2GhhriL
aAbMphysKoHXt+IDYwXacQKBgQCrzASYVxwfzg+Uq/UqsjlK3mMm7ULaqghg/wvz
pC9gvUKM7d1J6Pn7hAjHDGPemEe3pHMFKRIqUk+Z5z4Vyf4pChAV5q3li/oQRww2
qPGtid1noBK4mXAp89Qq7PjjWuj2VoF1lJrJAOLSFyozQfvgjVnjRVd8xwicX3CH
6LtMiQKBgQChDPtXq63pCl9UwHqa1lZ/f986VlOfAOj+x88ojw31Pvp/9qBkJ7JS
9B43bQgbhUPEn9YHJL1D8z8hCz1BKpNzbRnbDVEPTLb5nV03J3UVt/mAKCS6D9n0
BqXMFNdXRsJeBrAaLGw5GAyGMhSVJuABUWca+oHLpXsQ7xzHTqnfJQ==
-----END RSA PRIVATE KEY-----`

			return container
				.patch({ config: { 'environment.PRIVATE_KEY': key }})
				//.then(() => container.exec('echo', ['$PRIVATE_KEY', '>', '/test']))
				//.then(() => container.exec('cat', ['/test']))
				.then(() => container.get_info())
				.then(info => info.config['environment.PRIVATE_KEY'])
				.then(output => {
					output.should.equal(key);
				});
		});
	});

	describe('patch()', () => {
		it('Updates container config', () => {
			return container
				.patch({ config: { 'environment.CONTAINER_NAME': config.container.name } })
				.then(() => container.get_info())
				.should.eventually.have.property('config').that.has.property('environment.CONTAINER_NAME').that.equals(config.container.name);
		});
	});

	describe('mount()', () => {
		it('Mounts host path in container', () => {
			return container
				.mount(config.container.mount.source, config.container.mount.path, config.container.mount.name)
				.then(() => container.exec('ls', [config.container.mount.path]))
				.then(obj => obj.stdout)
				.should.eventually.contain('lib');
		});
	});

	describe('unmount()', () => {
		it('Unmounts host path from container', () => {
			return container.unmount(config.container.mount.name)
				.then(() => container.exec('ls', [config.container.mount.path]))
				.then(obj => obj.stdout)
				.should.eventually.have.length(0);
		})
	});

	describe('upload()', () => {
		it('Uploads a string to a file in container', () => {
			return container.upload(config.container.upload_string.source, config.container.upload_string.path)
				.then(() => container.exec('cat', [config.container.upload_string.path]))
				.then(obj => obj.stdout)
				.should.eventually.contain(config.container.upload_string.source);
		})

		it('Uploads a file to the container', () => {
			return container.upload(fs.createReadStream(config.container.upload.source), config.container.upload.path)
				// Check if file is there and contains correct string
				.then(() => container.exec('cat', [config.container.upload.path]))
				.then(obj => obj.stdout)
				.should.eventually.contain(fs.readFileSync(config.container.upload.source).toString().replace('\n', ''));
		})
	});

	describe('delete()', () => {
		it('Deletes container', function() {
			this.timeout(10000);

			// TODO - when other containers are running this test fails
			return container.delete()
				.then(() => lxc.list())
				.should.eventually.be.a('Array').that.not.contains(config.container.name);
		});
	});
});
