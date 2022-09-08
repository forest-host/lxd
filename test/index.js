
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.should();
chai.use(chaiAsPromised);

import { LXD, Container, Image, Volume, Snapshot } from '../src';
import { map_series } from '../src/util';

// TODO - Split up tests to seperate files
// TODO - Tests for operation? (though it is covered by almost everything)

var multiline_string = `-----BEGIN RSA PRIVATE KEY-----
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

const config = {
    container: {
        name: 'test',
        image: 'alpine/edge',
        variable: {
            key: 'TREE',
            value: 'Beech',
        },
        upload: {
            file: './test/transfer.txt',
            path: '/transfer.txt',
        },
        upload_string: {
            content: 'string',
            path: '/uploaded.txt',
        },
        download: {
            source: '/uploaded.txt',
            path: __dirname + '/downloaded.txt',
        },
    },
    volume: 'volume',
    clone: 'clone',
    snapshot: 'snapshot',
    backup: 'backup',
    image: {
        aliases: [{
            name: 'lxd-test-image'
        }],
        profiles: [ 'default', 'lxd' ],
    },
};

const lxd = new LXD({ key: '.keys/tests.key', cert: '.keys/tests.crt', port: '8443', host: '127.0.0.1' });
const pool = lxd.get_pool('default');

const clean_up_failed_tests = async function() {
    try {
        await lxd.get_container(config.container.name).stop();
    } catch(_) {}
    try {
        await lxd.get_container(config.container.name).destroy();
    } catch(_) {}

    try {
        await pool.get_volume(config.volume).destroy();
    } catch(_) {}

    try {
        let image = await lxd.get_image().by_alias(config.image.aliases[0].name);
        await image.destroy();
    } catch(_) {}
}

describe('Pool', () => {
    before(function() { this.timeout(30000); return clean_up_failed_tests() });

    describe('list()', () => {
        it('Lists custom storage volumes in pool', () => {
            return pool.list()
                .should.eventually.be.a('Array')
                .that.not.contains(config.volume);
        });
    });

    describe('get_volume()', () => {
        it('Returns volume representation', () => {
            let volume = pool.get_volume(config.volume);
            volume.should.be.instanceOf(Volume);
        })
    })
});

describe('Volume', () => {
    let container = lxd.get_container(config.container.name).from_image(config.container.image);
    let volume = pool.get_volume(config.volume);

    // Clean up failed previous runs
    before(function() { this.timeout(30000); return clean_up_failed_tests(); });

    describe('create()', () => {
        before(() => volume.create())

        it('Creates new storage volume', async () => {
            let list = await pool.list();

            list.should.contain(config.volume);
        })
        it('Loads volume config', () => {
            volume.name().should.equal(config.volume);
            volume.is_synced.should.equal(true);
        })
    })

    describe('clone_from()', () => {
        let clone = pool.get_volume('clone').clone_from(volume);
        let string = 'this is a string\n';
        let file = 'test.txt';
        let mount = {
            path: '/volume',
            name: 'volume',
        };

        before(async function () {
            this.timeout(30000);
            // Create container that has volume mounted & upload something to volume so we can test cloning
            await container
                .mount(volume, mount.path, mount.name)
                .create();
            await container.start();
            await container.upload_string(string, path.join(mount.path, file));

            // Create a clone & mount it instead of origin volume
            await clone.create();
            await container
                .unmount(mount.name)
                .mount(clone, mount.path, mount.name)
                .update();
        });

        // "volume" is used in next tests, clone is not so remove it
        after(async () => {
            await container.stop(true);
            await container.destroy();
            await clone.destroy();
        });

        it('clones volume from other volume', async () => {
            let download = await container.download(path.join(mount.path, file));
            download.should.equal(string);
        })
    })

    describe('load()', () => {
        before(() => {
            volume.unload();
            return volume.load();
        })

        it('Loads volume config', () => {
            volume.name().should.equal(config.volume);
            volume.is_synced.should.equal(true);
        })
    })

    describe('destroy()', () => {
        before(() => volume.destroy());

        it('Destroys volume', async () => {
            let list = await pool.list();
            list.should.not.contain(config.volume);
        });
        it('Unloads config', () => {
            volume.is_synced.should.equal(false);
        })
    })

    describe('get_snapshot()', () => {
        it('Returns snapshot representation', () => {
            let snapshot = volume.get_snapshot(config.snapshot);
            snapshot.should.be.instanceOf(Snapshot);
        })
    })
})

describe('Snapshot', () => {
    let container = lxd
        .get_container(config.container.name)
        .from_image(config.container.image);
    let volume = pool.get_volume(config.volume);
    let snapshot = volume.get_snapshot(config.snapshot);

    // Do all this to test snapshot restore,
    // seems like a lot of work to check if restore is working...
    // We do this here so we can use the snapshot create test to create snapshot and save time..
    before(async function() {
        this.timeout(30000);
        await clean_up_failed_tests();

        await Promise.all([volume.create(), container.create()]);
        await container.mount(volume, '/test', 'test').update();
        await container.start();
        await container.upload_string('This should still be there!', '/test/keep.txt');
    });
    after(async function() {
        this.timeout(30000);

        await container.stop();
        await container.destroy();
        await volume.destroy();
    });

    describe('create()', () => {
        before(() => snapshot.create());

        it('Creates snapshot', async () => {
            let list = await volume.list_snapshots();
            list.should.contain(config.snapshot);
        });
        it('Loads snapshot config', () => {
            snapshot.config.name.should.equal(config.snapshot);
        });
    });

    describe('load()', () => {
        before(() => {
            snapshot.unload();
            return snapshot.load();
        });

        it('Loads snapshot config', () => {
            snapshot.config.name.should.equal(config.snapshot);
            snapshot.is_synced.should.equal(true);
        });
    });

    // TODO - Is there a simple way to test this without testing the actual storage?
    // There does not seem a way to get snapshot restores from LXD
    // So for now, use a container & mounted volume to test this logic
    // Also, this depends on the snapshot create test above
    describe('restore()', () => {
        let file_name = '/test/rollback.txt';
        before(() => container.upload_string('this should be gone!', file_name));

        it('restores volume to snapshot', async function() {
            this.timeout(30000);
            await container.stop();
            await snapshot.restore();
            await container.start();

            container.download(file_name).should.be.rejected;
        })
    })

    describe('destroy()', () => {
        before(() => snapshot.destroy());

        it('Destroys snapshot', async () => {
            let list = await volume.list_snapshots();
            list.should.not.contain(config.snapshot);
        });
        it('Unloads snapshot config', () => {
            snapshot.is_synced.should.equal(false);
        });
    });
})

describe('Backup', () => {
    let volume = pool.get_volume(config.volume);
    let backup = volume.get_backup(config.backup);

    before(async () => {
        await volume.create()
    });

    after(() => volume.destroy());

    describe('create()', () => {
        before(() => backup.set_expires_at(new Date()).create());
        after(() => backup.unload());

        it('Creates backup', async () => {
            let list = await volume.list_backups();
            list.should.contain(config.backup);
        });

        it('Loads backup config', () => {
            backup.config.name.should.equal(config.backup);
        });

    });

    describe('load()', () => {
        before(() => {
            return backup.load();
        });

        it('Loads backup config', () => {
            backup.config.name.should.equal(config.backup);
            backup.is_synced.should.equal(true);
        });
    });

    describe('download()', () => {
        it('download backup');
    });

    describe('destroy()', () => {
        before(() => backup.destroy());

        it('Destroys backup', async () => {
            let list = await volume.list_backups();
            list.should.not.contain(config.backup);
        });
        it('Unloads backup config', () => {
            backup.is_synced.should.equal(false);
        });
    });
})

describe('LXD Client', () => {
    let container = lxd.get_container(config.container.name);
    let image = lxd.get_image();

    // Clean up previously failed tests
    before(function() { this.timeout(30000); return clean_up_failed_tests(); });

    describe('list()', () => {
        it('Responds with a array', async () => {
            let list = await lxd.list();
            list.should.be.a('array').that.not.includes(config.container.name);
        });
    });

    describe('get_container()', () => {
        it('Returns container instance', () => {
            container.should.be.instanceOf(Container);
        });
    });

    describe('get_image', () => {
        it('Returns image instance', () => {
            image.should.be.instanceOf(Image);
        })
    })
});

describe('Container', () => {
    let container = lxd.get_container(config.container.name);
    let volume = pool.get_volume(config.volume);

    // Clean up previously failed tests
    before(async function() { 
        this.timeout(30000); 
        await clean_up_failed_tests(); 
        return volume.create();
    });
    after(() => volume.destroy());

    describe('from_image()', () => {
        it('Sets image source with alias', () => {
            container.from_image(config.container.image);
            container.config.source.alias.should.not.be.undefined;
        })
    });

    describe('on_target()', () => {
        it('Sets up container on specific host in LXD cluster');
    })

    describe('create()', () => {
        before(function () {
            this.timeout(30000);
            return container
                .mount(volume, '/test', 'test')
                .set_environment_variable(config.container.variable.key, config.container.variable.value)
                .create();
        })

        after(() => container.unmount('test').unset_environment_variable(config.container.variable.key).update());

        it('Creates container', () => {
            lxd.list().should.eventually.contain(config.container.name);
        });

        it('Loads config', () => {
            container.name().should.equal(config.container.name);
            container.config.config.should.have.property(`environment.${config.container.variable.key}`)
                .that.equals(config.container.variable.value);
            container.config.devices.should.have.property('test').that.has.property('source').that.equals(volume.name());
            container.is_synced.should.equal(true);
        });
    })

    describe('set_state()', () => {
        it('Changes container state', async () => {
            await container.set_state('start');
            let state = await container.get_state();
            state.should.have.property('status').that.equals('Running');
        })
    })

    describe('get_state()', () => {
        it('returns state of container', async () => {
            let state = await container.get_state();
            state.status.should.equal('Running');
        });
    });

    describe('wait_for_dhcp_lease()', () => {
        it('Waits for dhcp lease', async function() {
            this.timeout(10000);

            await container.wait_for_dhcp_lease()
            let addresses = await container.get_ipv4_addresses();
            addresses.should.have.length(1);
        });
    });

    describe('load()', () => {
        before(() => {
            container.unload();
            return container.load();
        });

        it('Loads config', () => {
            container.config.should.have.property('name').that.equals(config.container.name);
        })
    });

    describe('patch()', () => {
        before(() => container.patch({ config: { 'environment.CONTAINER_NAME': config.container.name } }));

        it('Updates container config', () => {
            container.config.config.should.have.property('environment.CONTAINER_NAME').that.equals(config.container.name);
        });

        it('Correctly handles multiline variables', async () => {
            await container.patch({ config: { 'environment.PRIVATE_KEY': multiline_string }});
            container.config.config['environment.PRIVATE_KEY'].should.equal(multiline_string);
        });
    });

    describe('mount()', () => {
        it('Adds LXD volume config to local container config', () => {
            container.mount(volume, '/test_volume', 'volume');

            container.config.devices.should.have.property('volume').that.is.a('Object');
            container.config.devices['volume'].should.have.property('pool').that.equals(volume.pool.name());
            container.config.devices['volume'].should.have.property('source').that.equals(volume.name());
        });

        it('Adds host mount to local container config', () => {
            container.mount('/test', '/test_path', 'path');

            container.config.devices.should.have.property('path').that.is.a('Object');
            container.config.devices['path'].should.have.property('path').that.equals('/test_path')
            container.config.devices['path'].should.have.property('source').that.equals('/test');
        });
    })

    describe('set_environment_variable()', () => {
        it('Adds environment variable to local config', () => {
            container.set_environment_variable(config.container.variable.key, config.container.variable.value);

            container.config.config.should.have.property(`environment.${config.container.variable.key}`)
                .that.equals(config.container.variable.value);
        });
    })

    describe('update()', () => {
        before(async () => {
            // Reset container config to clear previous test stuff
            container.unload();
            await container.load();

            return container
                .mount(volume, '/test', 'test')
                .set_environment_variable(config.container.variable.key, config.container.variable.value)
                .update()
        })

        after(() => {
            return container.unmount('test').update();
        });

        it('Updates config of container in LXD with local config', () => {
            container.config.config.should.have.property(`environment.${config.container.variable.key}`)
                .that.equals(config.container.variable.value);
            container.config.devices.should.have.property('test').that.has.property('source').that.equals(volume.name());
        });
    })

    describe('exec()', () => {
        it('Executes command in container', async () => {
            let { stdout } = await container.exec('hostname')
            stdout[0].should.contain(config.container.name);
        });

        it('Executes command in root path when no working directory is passed', async () => {
            let { stdout } = await container.exec('pwd');
            stdout[0].should.equal('/root');
        })

        it('Executes command in working directory that was passed', async () => {
            let cwd = '/etc';
            let { stdout } = await container.exec('pwd', { cwd });
            stdout[0].should.equal(cwd);
        })

        it('Has access to environment variables', async () => {
            // We'll have to execute in shell to echo env variables
            let { stdout } = await container.exec('echo', [`$${config.container.variable.key}`], { shell: true });
            stdout[0].should.equal(config.container.variable.value);
        })

        it('Interrupts commands that run longer than timeout when timeout is passed', async function() {
            this.timeout(1000);
            // Timeout is in millis
            let command = await container.exec('sleep', ['3'], { timeout: 500 });
            command.stdout.should.have.length(0);
            command.status.should.be.above(0);
        });

        // TODO - it should be possible to get command return code after command is done
        // probably do this by using operation classes
        it('Returns sockets when interactive is passed', async () => {
            let sockets = await container.exec('echo', ['test'], { interactive: true })
            let messages = [];

            sockets.should.have.property('control');
            sockets.should.have.property('0');

            // See if output matches
            sockets['1'].on('message', data => {
                var string = data.toString('utf8').trim();

                // Push strings onto output array, seperated by newline, use apply so we can pass split string as arguments to push
                if(string) {
                    messages.push.apply(messages, string.split('\n'));
                }
            });

            await new Promise(resolve => {
                // When control closes, run tests
                sockets.control.on('close', () => {
                    // When control closes, we need to close the stdin/stdout socket
                    ['0', '1', '2'].forEach(key => sockets[key].close());
                    messages.map(m => m.toString().should.contain('test'))
                    resolve();
                });
            })
        });

        it('Returns operation when interactive is passed, making it possible to get command return code');

        it('Returns return-code for commands', async () => {
            let { status } = await container.exec('rm', ['/not/existing/directory'])
            status.should.equal(1);
        });

        it('Does not hang at some point during sequential execution', function() {
            this.timeout(20000);
            let commands = [];

            for(var i = 0; i < 20; i++) {
                commands.push({ cmd: 'touch', args: ['cookie'] });
                commands.push({ cmd: 'chmod', args: ['600', 'cookie'] });
                commands.push({ cmd: 'rm', args: ['cookie'] });
            }

            return map_series(commands, command => {
                return container.exec(command.cmd, command.args);
            })
        })
    });

    describe('upload_string()', () => {
        before(() => container.upload_string(config.container.upload_string.content, config.container.upload_string.path));

        it('Uploads a string to a file in container', async () => {
            let { stdout } = await container.exec('cat', [config.container.upload_string.path]);
            stdout.should.contain(config.container.upload_string.content);
        })
    });

    describe('upload()', () => {
        before(() => container.upload(fs.createReadStream(config.container.upload.file), config.container.upload.path));

        it('Streams readable stream to container', async () => {
            let { size } = await fs.promises.stat(config.container.upload.file);
            let { stdout } = await container.exec('stat', ['-c', '%s', config.container.upload.path]);
            stdout[0].should.contain(size);
        });
    })

    describe('download()', () => {
        it('Downloads a file from container', () => {
            return container.download(config.container.download.source)
                .should.eventually.equal(config.container.upload_string.content);
        });

        it('Errors on non-existant file', () => {
            return container.download('/this_does_not_exist')
                .should.be.rejected;
        })
    })

    describe('publish()', () => {
        let image;

        after(() => image.destroy());

        it('does not publish running container', () => {
            return container.publish().should.eventually.be.rejected;
        })

        it('publishes container as image', async function () {
            this.timeout(30000);
            await container.stop();
            image = await container.publish();

            image.should.be.instanceOf(Image);
            image.is_synced.should.equal(true);
            image.config.aliases.should.deep.include.members([{ name: 'test', description: '' }]);
        })
    })

    describe('destroy()', () => {
        before(() => container.start());

        it('does not delete running container', () => {
            container.destroy().should.be.rejected;
        });

        it('Deletes stopped container', async function() {
            this.timeout(30000);
            await container.stop();
            await container.destroy()
            let list = await lxd.list();
            list.should.be.a('Array').that.not.contains(config.container.name);
        });
    });
});

describe('Image', () => {
    let container = lxd
        .get_container(config.container.name)
        .from_image(config.container.image);
    let image = lxd.get_image();

    // Clean up previously failed tests
    before(async function() {
        this.timeout(30000);
        await clean_up_failed_tests();
        return container.create();
    });
    after(async () => {
        //await container.stop();
        return container.destroy()
    });

    describe('from_container()', () => {
        it('sets container as source', () => {
            image.from_container(container);
            image.config.source.name.should.equal(config.container.name);
        });
    })

    describe('set_aliases()', () => {
        before(() => image.set_aliases(config.image.aliases));

        it('sets aliases', () => {
            image.config.aliases.should.equal(config.image.aliases);
        })
    })

    describe('create()', () => {
        before(async function () {
            this.timeout(30000);
            return image.create();
        })

        it('creates image', async () => {
            return lxd.list_images()
                .should.eventually.include(`/1.0/images/${image.name()}`);
        })

        it('Loads image config', () => {
            image.is_synced.should.be.true;
        })
    })

    describe('set_profiles()', () => {
        before(() => image.set_profiles(config.image.profiles));

        it('errors when image is not loaded / created', () => {
            // Profiles can only be set after loading / creation (https://discuss.linuxcontainers.org/t/container-config-sticky-with-image/5782)
            (() => lxd.get_image().set_profiles(config.image.profiles)).should.throw(Error);
        })

        it('sets profiles', () => {
            image.config.profiles.should.eql(config.image.profiles);
        })

        it('unloads config', () => {
            image.is_synced.should.false;
        })
    })

    describe('update()', () => {
        before(() => image.update());

        it('updated image config', () => {
            image.config.profiles.should.eql(config.image.profiles);
        })

        it('loads config', () => {
            image.is_synced.should.be.true;
        })
    });


    describe('load()', () => {
        before(() => {
            // Grab new instance while passing fingerprint to test loading existing images
            image = lxd.get_image(image.config.fingerprint);
            return image.load();
        })

        it('loads image config', () => {
            image.is_synced.should.be.true;
        });
    })

    describe('by_alias()', () => {
        it('finds image by alias', async () => {
            return lxd.get_image().by_alias(config.image.aliases[0].name)
                .should.eventually.be.an('Object')
                .that.has.property('config');
        })
    })

    describe('destroy()', () => {
        let fingerprint;
        before(async () => {
            fingerprint = image.name();
            return image.destroy();
        })

        it('deletes image', async () => {
            return lxd.list_images()
                .should.eventually.be.a('Array')
                .that.not.contains(`/1.0/images/${fingerprint}`);
        })
    })

});

// This test is here to test the event stash, as LXD was passing events before we were listening
describe('Destroying container after creating it', () => {
    it('Returns', async function() {
        this.timeout(30000);

        let container = await lxd
            .get_container(config.container.name)
            .from_image(config.container.image)
            .create();

        try {
            await container.stop();
        } catch(err) { console.error('Could not stop container') };
        try {
            await container.destroy();
        } catch(err) { console.error('Could not destroy container') };
    })
})
