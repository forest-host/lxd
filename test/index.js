
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.should();
chai.use(chaiAsPromised);

import { LXD, Container, Volume, Snapshot } from '../src';
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

var config = {
  client: {
    key: './test/keys/key.pem',
    cert: './test/keys/cert.pem',
    port: '8443',
    host: '127.0.0.1',
  },
  container: {
    name: 'test',
    image: {
      os: 'Alpine',
      release: '3.12',
    },
    upload: {
      content: 'string',
      path: '/uploaded.txt',
    },
    download: {
      source: '/uploaded.txt',
      path: __dirname + '/downloaded.txt',
    },
  },
  pool: 'default',
  volume: 'volume',
  clone: 'clone',
  snapshot: 'snapshot',
};

const lxd = new LXD(config.client);
const pool = lxd.get_pool(config.pool);

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
  let container = lxd.get_container(config.container.name).from_image_properties(config.container.image.os, config.container.image.release);
  let volume = pool.get_volume(config.volume);

  // Clean up failed previous runs
  //before(function() { this.timeout(30000); return clean_up_failed_tests(); });

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

    before(async () => {
      await container.create()
    })

    after(async () => {
      await container.destroy();
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
  let container = lxd.get_container(config.container.name).from_image_properties(config.container.image.os, config.container.image.release);
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

describe('LXD Client', () => {
  let container = lxd.get_container(config.container.name);

  // Clean up previously failed tests
  //before(function() { this.timeout(30000); return clean_up_failed_tests(); });

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
});

describe('Container', () => {
  let container = lxd.get_container(config.container.name);
  let volume = pool.get_volume(config.volume);

  before(() => volume.create());
  after(() => volume.destroy());

  describe('from_image()', () => {
    it('Sets image source with alias', () => {
      container.from_image('alias');
      container.config.source.alias.should.not.be.undefined;
    })
  });

  describe('from_image_properties()', () => {
    it('Sets image source with image properties', () => {
      container.from_image_properties(config.container.image.os, config.container.image.release);
      container.config.source.properties.should.not.be.undefined;
    });
  });

  describe('on_target()', () => {
    it('Sets up container on specific host in LXD cluster');
  })

  describe('create()', () => {
    before(() => {
      return container
        .mount(volume, '/test', 'test')
        .set_environment_variable('VARNAME', 'val')
        .create();
    })

    after(() => container.unmount('test').unset_environment_variable('VARNAME').update());

    it('Creates container', () => {
      lxd.list().should.eventually.contain(config.container.name);
    });

    it('Loads config', () => {
      container.name().should.equal(config.container.name);
      container.config.config.should.have.property('environment.VARNAME').that.equals('val');
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
      container.set_environment_variable('VARIABLE_NAME', 'value');

      container.config.config.should.have.property('environment.VARIABLE_NAME').that.equals('value');
    });
  })

  describe('update()', () => {
    before(async () => {
      // Reset container config to clear previous test stuff
      container.unload();
      await container.load();

      return container
        .mount(volume, '/test', 'test')
        .set_environment_variable('VARNAME', 'val')
        .update()
    })

    after(() => {
      return container.unmount('test').update();
    });

    it('Updates config of container in LXD with local config', () => {
      container.config.config.should.have.property('environment.VARNAME').that.equals('val');
      container.config.devices.should.have.property('test').that.has.property('source').that.equals(volume.name());
    });
  })

  describe('exec()', () => {
    it('Executes command in container', async () => {
      let { output } = await container.exec('hostname')
      output[0].should.contain(config.container.name);
    });

    it('Interrupts commands that run longer than timeout when timeout is passed', async () => {
      // Timeout is in millis
      let command = await container.exec('sleep', ['3;', 'echo', 'test'], { timeout: 500 });
      command.output.should.have.length(0);
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
      sockets['0'].on('message', data => {
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
          sockets[0].close();
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

    it('Correctly handles multiline variables', async () => {
      await container.patch({ config: { 'environment.PRIVATE_KEY': multiline_string }});
      container.config.config['environment.PRIVATE_KEY'].should.equal(multiline_string);
    });
  });

  describe('upload_string()', () => {
    before(() => container.upload_string(config.container.upload.content, config.container.upload.path));

    it('Uploads a string to a file in container', async () => {
      let { output } = await container.exec('cat', [config.container.upload.path]);
      output.should.contain(config.container.upload.content);
    })
  });

  describe('upload()', () => {
    it('Streams readable stream to container');
  })

  describe('download()', () => {
    it('Downloads a file from container', () => {
      return container.download(config.container.download.source)
        .should.eventually.equal(config.container.upload.content);
    });
  })

  describe('delete()', () => {
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

// This test is here to test the event stash, as LXD was passing events before we were listening
describe('Destroying container after creating it', () => {
  it('Returns', async function() {
    this.timeout(30000);

    let container = await lxd
      .get_container(config.container.name)
      .from_image_properties(config.container.image.os, config.container.image.release)
      .create();

    try {
      await container.stop();
    } catch(err) { console.error('Could not stop container') };
    try {
      await container.destroy();
    } catch(err) { console.error('Could not destroy container') };
  })
})
