
# LXD client

This is a simple example LXD client implementation.

### Testing

This client library tests by querying LXD directly, no mocks. To do this, it
needs some keys, which can be generated with the included `./generate_keys`
script.
```
./generate_keys
```

Add the corresponding certificate to your local LXD with:
```
lxc config trust add ./.keys/tests.crt
```
