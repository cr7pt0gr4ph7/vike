import { expect, test } from '@brillout/test-e2e'
import { fetchConfigJson } from '../../../utils/fetchConfigJson'

function testSettingOnlyAvailableInCorrectEnv() {
  test('Custom Setting Env - Client-only', async () => {
    let json = await fetchConfigJson('/config-meta/env/client', { clientSide: true })

    expect(json).to.deep.equal({
      isBrowser: true,
      settingServerOnly: 'undefined',
      settingClientOnly: { nested: 'clientOnly @ /env' },
      settingConfigOnly: 'undefined'
    })
  })

  test('Custom Setting Env - Server-only', async () => {
    let json = await fetchConfigJson('/config-meta/env/server', { clientSide: false })

    expect(json).to.deep.equal({
      isBrowser: false,
      settingServerOnly: { nested: 'serverOnly @ /env' },
      settingClientOnly: 'undefined',
      settingConfigOnly: 'undefined'
    })
  })
}

export default [testSettingOnlyAvailableInCorrectEnv]
