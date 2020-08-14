
import extend from '@forest.host/extend';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.should();
chai.use(chaiAsPromised);

import { LXD, Volume, Snapshot } from '../src';
import { map_series } from '../src/util';

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
      source: {
        type: 'image',
        properties: {
          os: "Alpine",
          release: "3.12",
          architecture: "amd64"
        }
      }
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

var lxd = new LXD(config.client);
var container = lxd.get_container(config.container.name);
var pool = lxd.get_pool(config.pool);

describe('Pool', () => {
  // Clean up clone
  //after(() => pool.destroy_volume(config.clone))

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
  let volume = pool.get_volume(config.volume);

  describe('create()', () => {
    before(() => volume.create())

    it('Creates new storage volume', async () => {
      let list = await pool.list();

      list.should.contain(config.volume);
    })
    it('Loads volume config', () => {
      volume.config.name.should.equal(config.volume);
    })
  })

  describe('load()', () => {
    before(() => {
      delete volume.config;
      return volume.load();
    })

    it('Loads volume config', () => {
      volume.config.name.should.equal(config.volume);
    })
  })

  describe('destroy()', () => {
    before(() => volume.destroy());

    it('Destroys volume', async () => {
      let list = await pool.list();
      list.should.not.contain(config.volume);
    });
    it('Unsets config', () => {
      volume.should.not.have.property('config');
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
  let volume = pool.get_volume(config.volume);
  let snapshot = volume.get_snapshot(config.snapshot);

  before(() => volume.create());
  after(() => volume.destroy());

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
      delete snapshot.config;
      return snapshot.load();
    });

    it('Loads snapshot config', () => {
      snapshot.config.name.should.equal(config.snapshot);
    });
  });

  describe('destroy()', () => {
    before(() => snapshot.destroy());

    it('Destroys snapshot', async () => {
      let list = await volume.list_snapshots();
      list.should.not.contain(config.snapshot);
    });
    it('Unsets snapshot config', () => {
      snapshot.should.not.have.property('config');
    });
  });
})

/*
  describe('create_volume()', () => {
    it('Creates a new storage volume', () => {
      return pool.create_volume(config.volume)
        .then(() => pool.list())
        .should.eventually.contain(config.volume);
    });

    it('Copies storage volumes', () => {
      return pool.create_volume(config.clone, config.volume)
        .then(() => pool.list())
        .should.eventually.contain(config.clone);
    })
  });

  describe('volume_info()', () => {
    it('Returns info object for volume', async () => {
      let info = await pool.volume_info(config.volume);
      info.should.have.property('name').that.equals(config.volume);
    })
  });

  describe('create_snapshot()', () => {
    it('Creates a snapshot', () => {
      // Match only last part of path in url
      const regex = /[^\/]+$/g;

      return pool.create_snapshot(config.volume, config.snapshot)
        .then(() => pool.list_snapshots(config.volume))
        .then(array => array.map(uri => uri.match(regex)[0]))
        .should.eventually.contain(config.snapshot);
    });
  });

  describe('destroy_snapshot()', () => {
    it('Destroys a snapshot', () => {
      const regex = /[^\/]+$/g;

      return pool.destroy_snapshot(config.volume, config.snapshot)
        .then(() => pool.list_snapshots(config.volume))
        .then(array => array.map(uri => uri.match(regex)[0]))
        .should.eventually.not.contain(config.snapshot);
    });
  })

  describe('destroy_volume()', () => {
    it('Destroys a storage volume', () => {
      return pool.destroy_volume(config.volume)
        .then(() => pool.list())
        .should.eventually.not.contain(config.volume);
    });
  });
});
*/

describe('LXD Client', () => {
  // Lazy fix for failing tests
  before(function() {
    this.timeout(5000);
    var lxd = new LXD(config.client);

    return container.delete()
      .catch(err => {
        if(err.error.error != 'not found')
          throw err;
      });
  })

  describe('list()', () => {
    it('Responds with a array', () => {
      return lxd.list()
        .should.eventually.be.a('array');
    });
  });

  describe('get_container()', () => {
    it('Returns container instance', () => {
      container.should.be.a('object');
    });
  });
});

describe('Container', () => {
  describe('launch()', () => {
    after(function() {
      this.timeout(20000);
      return container.delete();
    });

    it('Creates container', () => {
      return container.launch(config.container.image)
        .then(container => container.get_state())
        .should.eventually.have.property('status').that.equals('Running')
    });
  });

  describe('create_from_image()', () => {
    it('Creates stopped container', () => {
      return container.create_from_image(config.container.image)
        .then(container => container.get_state())
        .should.eventually.have.property('status').that.equals('Stopped')
    })
  })

  describe('start()', () => {
    it('Starts stopped container', () => {
      return container.start()
        .then(container => container.get_state())
        .should.eventually.have.property('status').that.equals('Running')
    })
  })

  describe('wait_for_dhcp()', () => {
    it('Returns address after dhcp is done', function() {
      this.timeout(40000);

      return container.wait_for_dhcp()
        .then(() => container.get_ipv4_addresses())
        .should.eventually.have.length(1);
    });
  });

  describe('get_info()', () => {
    it('Returns config of container', async () => {
      let info = await container.get_info();
      info.should.have.property('name');
    });
  });

  describe('get_state()', () => {
    it('returns state of container', () => {
      return container.get_state()
        .then(state => state.status.should.equal('Running'));
    });
  });

  describe('exec()', () => {
    it('Executes command in container', () => {
      return container.exec('hostname')
      // Get first line
        .then(obj => obj.output[0])
      // TODO returns object
        .should.eventually.contain(config.container.name);
    });

    it('Interrupts commands that run longer than timeout when timeout is passed', () => {
      // Timeout is in millis
      return container.exec('sleep', ['3;', 'echo', 'test'], { timeout: 500 })
        .then(obj => {
          obj.output.should.have.length(0);
          obj.status.should.be.above(0);
        })
    });

    // TODO - it should be possible to get command return code after command is done
    // probably do this by using operation classes
    it('Returns sockets when interactive is passed', done => {
      container.exec('echo', ['test'], { interactive: true })
        .then(sockets => {
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

          // When control closes, run tests
          sockets.control.on('close', () => {
            // When control closes, we need to close the stdin/stdout socket
            sockets[0].close();
            messages.map(m => m.toString().should.contain('test'))
            done()
          });
        })
    });

    it('Returns operation when interactive is passed, making it possible to get command return code');

    it('Returns return-code for commands', () => {
      return container.exec('rm', ['/not/existing/directory'])
        .then(obj => obj.status)
        .should.eventually.equal(1);
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

    it('Correctly handles multiline variables', () => {
      return container
        .patch({ config: { 'environment.PRIVATE_KEY': multiline_string }})
        .then(() => container.get_info())
        .then(info => info.config['environment.PRIVATE_KEY'])
        .then(output => {
          output.should.equal(multiline_string);
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

  describe('upload_string()', () => {
    it('Uploads a string to a file in container', () => {
      return container.upload_string(config.container.upload.content, config.container.upload.path)
        .then(() => container.exec('cat', [config.container.upload.path]))
        .then(obj => obj.output)
        .should.eventually.contain(config.container.upload.content);
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
    it('Deletes container', function() {
      this.timeout(10000);

      return container.delete()
        .then(() => lxd.list())
        .should.eventually.be.a('Array').that.not.contains(config.container.name);
    });
  });
});

