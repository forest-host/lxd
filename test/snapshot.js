
import {
    clean_volume,
    clean_container,
    create_volume,
    get_container,
} from './index.js'

describe('Snapshot', () => {
    afterEach(clean_volume)

    describe('create()', () => {
        it('Creates snapshot', async () => {
            let volume = await create_volume()
            let snapshot = await volume.get_snapshot('snap').create()

            let list = await volume.list_snapshots();
            list.should.contain(snapshot.name);
            snapshot.name.should.equal('snap');

            await volume.destroy()
        });
    });

    // There does not seem a way to get snapshot restores from LXD
    // So for now, use a container & mounted volume to test this logic
    // Also, this depends on the snapshot create test above
    describe('restore()', () => {
        afterEach(clean_container)

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

            await volume.destroy()
        });
    });
})
