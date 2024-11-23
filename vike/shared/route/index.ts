export { route }
export type { PageContextForRoute }
export type { PageContextFromRoute }
export type { PageRoutes }
export type { RouteMatches }

// Ensure we don't bloat runtime of Server Routing
import { assertClientRouting } from '../../utils/assertRoutingType.js'
import { isBrowser } from '../../utils/isBrowser.js'
if (isBrowser()) {
  assertClientRouting()
}

import type { PageFile } from '../getPageFiles.js'
import { assert, assertUsage, isPlainObject, objectAssign } from './utils.js'
import {
  assertPageContextUrl,
  type PageContextUrlInternal,
  type PageContextUrlSource
} from '../getPageContextUrlComputed.js'
import { resolvePrecedence } from './resolvePrecedence.js'
import { resolveRouteString } from './resolveRouteString.js'
import { resolveRouteFunction } from './resolveRouteFunction.js'
import { executeOnBeforeRouteHook } from './executeOnBeforeRouteHook.js'
import type { PageRoutes, RouteType } from './loadPageRoutes.js'
import { debug } from './debug.js'
import type { PageConfigRuntime, PageConfigGlobalRuntime } from '../page-configs/PageConfig.js'
import pc from '@brillout/picocolors'
import type { Hook } from '../hooks/getHook.js'

type PageContextForRoute = PageContextUrlInternal & {
  _pageFilesAll: PageFile[]
  _pageConfigs: PageConfigRuntime[]
  _allPageIds: string[]
  _pageConfigGlobal: PageConfigGlobalRuntime
  _pageRoutes: PageRoutes
  _onBeforeRouteHook: Hook | null
} & PageContextUrlSource
type PageContextFromRoute = {
  pageId: string | null
  routeParams: Record<string, string>
  _routingProvidedByOnBeforeRouteHook?: boolean
  _debugRouteMatches: RouteMatches
}
type RouteMatch = {
  pageId: string
  routeString?: string
  precedence?: number | null
  routeType: RouteType
  routeParams: Record<string, string>
}
type RouteMatches = 'CUSTOM_ROUTING' | RouteMatch[]

async function route(pageContext: PageContextForRoute): Promise<PageContextFromRoute> {
  debug('Pages routes:', pageContext._pageRoutes)
  assertPageContextUrl(pageContext)
  const pageContextFromRoute = {}

  // onBeforeRoute()
  const pageContextFromOnBeforeRouteHook = await executeOnBeforeRouteHook(pageContext)
  if (pageContextFromOnBeforeRouteHook) {
    if (pageContextFromOnBeforeRouteHook._routingProvidedByOnBeforeRouteHook) {
      assert(pageContextFromOnBeforeRouteHook.pageId)
      return pageContextFromOnBeforeRouteHook
    } else {
      objectAssign(pageContextFromRoute, pageContextFromOnBeforeRouteHook)
    }
  }
  // We take into account pageContext.urlLogical set by onBeforeRoute()
  objectAssign(pageContext, pageContextFromOnBeforeRouteHook)

  // Vike's routing
  const allPageIds = pageContext._allPageIds
  assertUsage(allPageIds.length > 0, 'No page found. You must create at least one page.')
  assert(pageContext._pageFilesAll.length > 0 || pageContext._pageConfigs.length > 0)
  const { urlPathname } = pageContext
  assert(urlPathname.startsWith('/'))

  const routeMatches: RouteMatch[] = []
  await Promise.all(
    pageContext._pageRoutes.map(async (pageRoute): Promise<void> => {
      const { pageId, routeType } = pageRoute

      // Filesystem Routing
      if (pageRoute.routeType === 'FILESYSTEM') {
        const { routeString } = pageRoute
        const match = resolveRouteString(routeString, urlPathname)
        if (match) {
          const { routeParams } = match
          routeMatches.push({ pageId, routeParams, routeString, routeType })
        }
        return
      }

      // Route String defined in `.page.route.js`
      if (pageRoute.routeType === 'STRING') {
        const { routeString } = pageRoute
        const match = resolveRouteString(routeString, urlPathname)
        if (match) {
          const { routeParams } = match
          assert(routeType === 'STRING')
          routeMatches.push({
            pageId,
            routeString,
            routeParams,
            routeType
          })
        }
        return
      }

      // Route Function defined in `.page.route.js`
      if (pageRoute.routeType === 'FUNCTION') {
        const { routeFunction, routeDefinedAtString } = pageRoute
        const match = await resolveRouteFunction(routeFunction, pageContext, routeDefinedAtString)
        if (match) {
          const { routeParams, precedence } = match
          routeMatches.push({ pageId, precedence, routeParams, routeType })
        }
        return
      }

      assert(false)
    })
  )

  resolvePrecedence(routeMatches)
  const winner = routeMatches[0] ?? null

  debug(`Route matches for URL ${pc.cyan(urlPathname)} (in precedence order):`, routeMatches)

  objectAssign(pageContextFromRoute, { _debugRouteMatches: routeMatches })
  // For vite-plugin-vercel https://github.com/magne4000/vite-plugin-vercel/blob/main/packages/vike-integration/vike.ts#L173
  objectAssign(pageContextFromRoute, { _routeMatch: winner })

  if (!winner) {
    objectAssign(pageContextFromRoute, {
      pageId: null,
      routeParams: {}
    })
    return pageContextFromRoute
  }

  {
    const { routeParams } = winner
    assert(isPlainObject(routeParams))
    objectAssign(pageContextFromRoute, {
      pageId: winner.pageId,
      routeParams: winner.routeParams
    })
  }

  return pageContextFromRoute
}
