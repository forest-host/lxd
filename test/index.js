
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

import chai from 'chai';
chai.should();

import { LXD, Container, Image, Volume, Snapshot } from '../src';

// Util functions
const lxd = new LXD({ key: '.keys/tests.key', cert: '.keys/tests.crt', port: '8443', host: '127.0.0.1' });

const get_container = (name = 'testing', image = 'testing', profile = 'testing') => lxd
    .get_container(name)
    .from_image(image)
    .set_profile(profile)

const create_container = () => get_container().create()
const start_container = () => create_container().then(container => container.start())

const create_image = async function() {
    let container = await create_container()
    let image = await get_image().from_container(container).create()
    await container.destroy()
    return image
}

const get_pool = (name = 'default') => lxd.get_pool(name)
const get_volume = (name = 'volume') => get_pool().get_volume(name)
const create_volume = () => get_volume().create()

const clean = async function() {
    if(this.currentTest.state != 'failed') {
        return
    }
    console.log('clean up')

    this.timeout(30000)
    try {
        await get_container().force_destroy()
    } catch(_) {}
    try {
        await get_volume().destroy()
    } catch(_) {}
}

describe('LXD Client', () => {
    describe('list()', () => {
        it('Responds with a array', async () => {
            let list = await lxd.list();
            list.should.be.a('array')
        });
    });

    describe('get_container()', () => {
        it('Returns container instance', () => {
            get_container().should.be.instanceOf(Container);
        });
    });

    describe('get_image', () => {
        it('Returns image instance', () => {
            lxd.get_image().should.be.instanceOf(Image);
        })
    })
});

describe('Pool', () => {
    afterEach(clean)

    describe('list()', () => {
        it('Lists custom storage volumes in pool', async () => {
            const list = await get_pool().list()
            list.should.be.a('Array')
        });
    });

    describe('get_volume()', () => {
        it('Returns volume representation', () => {
            get_pool().get_volume('test').should.be.instanceOf(Volume);
        })
    })
});

/*
describe('Volume', () => {
    afterEach(clean)

    describe('create()', () => {
        it('Creates new storage volume', async () => {
            let volume = await create_volume()
            let list = await get_pool().list();
            list.should.contain(volume.name());
            volume.is_synced.should.equal(true);
            await volume.destroy()
        })
    })

    describe('clone_from()', () => {
        it('clones volume from other volume', async function() {
            this.timeout(30000);

            let string = 'this is a string\n';
            let file = 'test.txt';
            let mount = {
                path: '/volume',
                name: 'volume',
            };

            let volume = await create_volume()
            // Create container that has volume mounted & upload something to volume so we can test cloning
            //let container = await get_container().mount(volume, mount.path, mount.name).create();
            let container = await create_container()
            await container.start()
            //await container.upload_string(string, path.join(mount.path, file));
            //await container.destroy();

            // Create a clone & mount it instead of origin volume
            //let clone = await get_volume('clone').clone_from(volume).create()
            //container = await get_container().mount(clone, mount.path, mount.name).create();
            //let download = await container.download(path.join(mount.path, file));
            //download.should.equal(string);

            await container.force_destroy()
            //await clone.destroy();
            await volume.destroy();
        })
    })

    describe('load()', () => {
        it('Loads volume config', async () => {
            let volume = await get_volume('name').create()
            volume.unload();
            await volume.load();

            volume.name().should.equal('name');
            volume.is_synced.should.equal(true);

            await volume.destroy()
        })
    })

    describe('destroy()', () => {
        it('Destroys volume', async () => {
            let volume = await get_volume().create()
            await volume.destroy()
            let list = await get_pool().list();

            list.should.not.contain(volume.name());
            volume.is_synced.should.equal(false);
        });
    })

    describe('get_snapshot()', () => {
        it('Returns snapshot representation', () => {
            let volume = get_volume();
            let snapshot = volume.get_snapshot('snap');
            snapshot.should.be.instanceOf(Snapshot);
        })
    })
})

describe('Snapshot', () => {
    afterEach(clean)

    describe('create()', () => {
        it('Creates snapshot', async () => {
            let volume = await create_volume()
            let snapshot = await volume.get_snapshot('snap').create()

            let list = await volume.list_snapshots();
            list.should.contain(snapshot.name());
            snapshot.name().should.equal('snap');

            await volume.destroy()
        });
    });

    describe('load()', () => {
        it('Loads snapshot config', async () => {
            let volume = await create_volume()
            let snapshot = await volume.get_snapshot('snap').create()

            snapshot.unload();
            await snapshot.load();
            snapshot.name().should.equal('snap');
            snapshot.is_synced.should.equal(true);

            await volume.destroy()
        });
    });

    // There does not seem a way to get snapshot restores from LXD
    // So for now, use a container & mounted volume to test this logic
    // Also, this depends on the snapshot create test above
    describe('restore()', () => {
        it('restores volume to snapshot', async function() {
            this.timeout(30000);
            let file_name = '/test/rollback.txt';

            // Snapshot before so we can rollback to it
            let volume = await create_volume()
            let snapshot = await volume.get_snapshot('snap').create()

            let container = await get_container().mount(volume, '/test', 'test').create()
            // Container has to be started to write to mount
            await container.start()
            //await container.upload_string('this should be gone!', file_name)
            await container.stop()

            await snapshot.restore();

            //await container.download(file_name)

            await container.destroy()
            await volume.destroy()
        })
    })

    describe('destroy()', () => {
        it('Destroys snapshot', async () => {
            let name = 'snap'
            let volume = await create_volume()
            let snapshot = await volume.get_snapshot(name).create()
            await snapshot.destroy()

            let list = await volume.list_snapshots();
            list.should.not.contain(name);
            snapshot.is_synced.should.equal(false);

            await volume.destroy()
        });
    });
})

describe('Backup', () => {
    afterEach(clean)

    describe('create()', () => {
        it('Creates backup', async () => {
            let volume = await create_volume()
            let backup = await volume.get_backup('back').create()

            let list = await volume.list_backups();
            list.should.contain('back');
            backup.config.name.should.equal('back');

            await volume.destroy()
        });
    });

    describe('load()', () => {
        it('Loads backup config', async () => {
            let name = 'back'
            let volume = await create_volume()
            let backup = await volume.get_backup(name).create()
            backup.unload()
            await backup.load();
            backup.name().should.equal(name);
            backup.is_synced.should.equal(true);

            await volume.destroy()
        });
    });

    describe('download()', () => {
        it('download backup');
    });

    describe('destroy()', () => {
        it('Destroys backup', async () => {
            let name = 'back'
            let volume = await create_volume()
            let backup = await volume.get_backup(name).create()

            await backup.destroy()

            let list = await volume.list_backups();
            list.should.not.contain(name);
            backup.is_synced.should.equal(false);

            await volume.destroy()
        });
    });
})
*/

describe('Container', () => {
    afterEach(clean)

    describe('from_image()', () => {
        it('Sets image source with alias', () => {
            let container = lxd.get_container('test').from_image('testing')
            container.config.source.alias.should.not.be.undefined;
        })
    });

    describe('on_target()', () => {
        it('Sets up container on specific host in LXD cluster', () => {
            let container = lxd.get_container('test').on_target('testing')
            container.target.should.not.be.undefined;
        });
    })

    describe('create()', () => {
        it('Creates container', async () => {
            let container = await create_container()
            
            let list = await lxd.list()
            list.should.contain(container.name());
            container.is_synced.should.equal(true);

            return container.destroy()
        });
    })

    describe('set_state()', () => {
        it('Changes container state', async () => {
            let container = await create_container()
            await container.set_state('start');

            let state = await container.get_state();
            state.should.have.property('status').that.equals('Running');

            await container.force_destroy()
        })
    })

    describe('wait_for_dhcp_lease()', () => {
        it('Waits for dhcp lease', async function() {
            this.timeout(10000);

            let container = await start_container()
            await container.wait_for_dhcp_lease()
            let addresses = await container.get_ipv4_addresses();
            addresses.should.have.length(1);

            await container.force_destroy()
        });
    });

    describe('mount()', () => {
        it('Adds LXD volume config to local container config', () => {
            let container = get_container()
            let volume = get_volume()
            container.mount(volume, '/test_volume', 'volume');
            container.config.devices.volume.pool.should.equal(volume.pool.name());
            container.config.devices.volume.source.should.equal(volume.name());
        });
    })

    describe('set_environment_variable()', () => {
        it('Adds environment variable to local config', () => {
            let container = get_container()
            container.set_environment_variable('TREE_HOST', 'Birch');
            container.config.config['environment.TREE_HOST'].should.equal('Birch');
        });

    })

    describe('update()', () => {
        it('Updates config of container in LXD with local config', async () => {
            [volume, container] = await Promise.all([create_volume(), create_container()])
            await container
                .mount(volume, '/test', 'test')
                .set_environment_variable('TREE_HOST', 'Birch')
                .update();

            container.config.config['environment.TREE_HOST'].should.equal('Birch');
            container.config.devices.test.source.should.equal(volume.name());

            await container.force_destroy()
        });
    })

    describe('exec()', () => {
        it('Executes command in container', async () => {
            let multiline = fs.readFileSync('./test.key')
            let container = get_container()
            await container
                .set_environment_variable('TREE_HOST', 'Birch')
                .set_environment_variable('MULTILINE', multiline)
                .create()

            ({ stdout } = await container.exec('hostname'))
            stdout[0].should.contain(container.name())

            ({ stdout } = await container.exec('pwd'))
            stdout[0].should.equal('/root')

            let cwd = '/etc';
            ({ stdout } = await container.exec('pwd', { cwd }))
            stdout[0].should.equal(cwd);

            // We'll have to execute in shell to echo env variables
            ({ stdout } = await container.exec('echo', ['$TREE_HOST'], { shell: true }))
            stdout[0].should.equal('Birch');

            ({ stdout } = await container.exec('echo', ['$MULTILINE'], { shell: true }))
            stdout[0].should.equal(multiline);

            // Timeout is in millis
            ({ status, stdout } = await container.exec('sleep', ['300'], { timeout: 100 }))
            stdout.should.have.length(0);
            status.should.be.above(0);

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

            let { status } = await container.exec('rm', ['/not/existing/directory'])
            status.should.equal(1);

            await container.force_destroy()
        });
    });

    describe('upload_string()', () => {
        it('Uploads a string to a file in container', async () => {
            let string = 'hey there'
            let path = '/uploaded.txt'
            let container = await start_container()
            await container.upload_string(string, path)

            let { stdout } = await container.exec('cat', [path]);
            stdout.should.contain(string);

            await container.force_destroy()
        })
    });

    describe('upload()', () => {
        it('Streams readable stream to container', async () => {
            let file = './test.key'
            let path = '/uploaded.key'

            let container = await start_container()
            await container.upload(fs.createReadStream(file), path)
            let { size } = await fs.promises.stat(file);
            let { stdout } = await container.exec('stat', ['-c', '%s', path]);
            stdout[0].should.contain(size);

            await container.force_destroy()
        });
    })

    describe('download()', () => {
        it('Downloads a file from container', async () => {
            let container = await start_container()
            let contents = await container.download('/etc/hosts')
            contents.should.contain(container.name())

            try {
                await container.download('/this_does_not_exist')
                throw new Error('Non-existant file download did not throw')
            } catch(_) {}

            await container.force_destroy()
        });
    })

    describe('publish()', () => {
        it('Publishes stopped containers', async function() {
            this.timeout(30000);
            let container = await start_container()
            try {
                await container.publish()
                throw new Error('Running container publishing did not throw')
            } catch(_) {}

            await container.stop();
            image = await container.publish();
            image.should.be.instanceOf(Image);
            image.is_synced.should.equal(true);
            image.config.aliases.should.deep.include.members([{ name: container.name(), description: '' }]);

            await container.destroy()
        })
    })

    describe('destroy()', () => {
        it('does not delete running container', async function() {
            this.timeout(30000);
            let container = await start_container()
        
            try {
                await container.destroy()
                throw new Error('Destroying running container did not throw')
            } catch(_) {}

            await container.stop();
            await container.destroy()

            let list = await lxd.list();
            list.should.not.contain(container.name())
        });
    });
});

describe('Image', () => {
    afterEach(clean)

    describe('from_container()', () => {
        it('sets container as source', () => {
            let container = get_container()
            let image = get_image()
            image.from_container(container);
            image.config.source.name.should.equal(container.name());
        });
    })

    describe('set_aliases()', () => {
        it('sets aliases', () => {
            aliases = [{ name: 'test' }]
            let image = get_image()
            image.set_aliases(aliases)
            image.aliases().should.equal(aliases);
        })
    })

    describe('create()', () => {
        it('creates image', async function() {
            this.timeout(30000);
            let image = await create_image()

            let list = await lxd.list_images()
            list.should.include(`/1.0/images/${image.name()}`);
            image.is_synced.should.be.true;

            await image.destroy()
        })
    })

    describe('destroy()', () => {
        it('deletes image', async function() {
            this.timeout(30000);
            let image = await create_image()

            let list = await lxd.list_images()
            list.should.not.contain(`/1.0/images/${image.name()}`);
        })
    })
});
