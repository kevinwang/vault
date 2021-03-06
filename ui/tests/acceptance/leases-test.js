import { test, skip } from 'qunit';
import moduleForAcceptance from 'vault/tests/helpers/module-for-acceptance';
import secretList from 'vault/tests/pages/secrets/backend/list';
import secretEdit from 'vault/tests/pages/secrets/backend/kv/edit-secret';
import mountSecrets from 'vault/tests/pages/settings/mount-secret-backend';
import Ember from 'ember';

let adapterException;
// testing error states is terrible in ember acceptance tests so these weird Ember bits are to work around that
// adapted from https://github.com/emberjs/ember.js/issues/12791#issuecomment-244934786
moduleForAcceptance('Acceptance | leases', {
  beforeEach() {
    adapterException = Ember.Test.adapter.exception;
    Ember.Test.adapter.exception = () => null;

    authLogin();
    this.enginePath = `kv-for-lease-${new Date().getTime()}`;
    // need a version 1 mount for leased secrets here
    return mountSecrets.visit().path(this.enginePath).type('kv').version(1).submit();
  },
  afterEach() {
    Ember.Test.adapter.exception = adapterException;
    return authLogout();
  },
});

const createSecret = (context, isRenewable) => {
  context.name = `secret-${new Date().getTime()}`;
  secretList.visitRoot({ backend: context.enginePath });
  secretList.create();
  if (isRenewable) {
    secretEdit.createSecret(context.name, 'ttl', '30h');
  } else {
    secretEdit.createSecret(context.name, 'foo', 'bar');
  }
};

const navToDetail = context => {
  visit('/vault/access/leases/');
  // all the
  click(`[data-test-lease-link="${context.enginePath}/"]`);
  // way down
  click(`[data-test-lease-link="${context.enginePath}/data/"]`);
  // the tree
  click(`[data-test-lease-link="${context.enginePath}/data/${context.name}/"]`);
  click(`[data-test-lease-link]:eq(0)`);
};

test('it renders the show page', function(assert) {
  createSecret(this);
  navToDetail(this);
  return andThen(() => {
    assert.equal(
      currentRouteName(),
      'vault.cluster.access.leases.show',
      'a lease for the secret is in the list'
    );
    assert.equal(
      find('[data-test-lease-renew-picker]').length,
      0,
      'non-renewable lease does not render a renew picker'
    );
  });
});

// skip for now until we find an easy way to generate a renewable lease
skip('it renders the show page with a picker', function(assert) {
  createSecret(this, true);
  navToDetail(this);
  andThen(() => {
    assert.equal(
      currentRouteName(),
      'vault.cluster.access.leases.show',
      'a lease for the secret is in the list'
    );
    assert.equal(find('[data-test-lease-renew-picker]').length, 1, 'renewable lease renders a renew picker');
  });
});

test('it removes leases upon revocation', function(assert) {
  createSecret(this);
  navToDetail(this);
  click('[data-test-lease-revoke] button');
  click('[data-test-confirm-button]');
  andThen(() => {
    assert.equal(
      currentRouteName(),
      'vault.cluster.access.leases.list-root',
      'it navigates back to the leases root on revocation'
    );
  });
  click(`[data-test-lease-link="${this.enginePath}/"]`);
  click('[data-test-lease-link="data/"]');
  andThen(() => {
    assert.equal(
      find(`[data-test-lease-link="${this.enginePath}/data/${this.name}/"]`).length,
      0,
      'link to the lease was removed with revocation'
    );
  });
});

test('it removes branches when a prefix is revoked', function(assert) {
  createSecret(this);
  visit(`/vault/access/leases/list/${this.enginePath}`);
  click('[data-test-lease-revoke-prefix] button');
  click('[data-test-confirm-button]');
  andThen(() => {
    assert.equal(
      currentRouteName(),
      'vault.cluster.access.leases.list-root',
      'it navigates back to the leases root on revocation'
    );
    assert.equal(
      find(`[data-test-lease-link="${this.enginePath}/"]`).length,
      0,
      'link to the prefix was removed with revocation'
    );
  });
});

test('lease not found', function(assert) {
  visit('/vault/access/leases/show/not-found');
  andThen(() => {
    assert.equal(
      find('[data-test-lease-error]').text().trim(),
      'not-found is not a valid lease ID',
      'it shows an error when the lease is not found'
    );
  });
});
