
import chai from 'chai';
chai.should();

import path from 'path';
import { 
    clean,
    get_volume,
    create_volume,
    create_container 
} from './'

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
