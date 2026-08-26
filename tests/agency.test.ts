import { describe, it, expect } from 'vitest'
import {
  DriverAgencyStore,
  assessCompliance,
  freshAgencyState,
  relationshipLabel,
} from '../src/drivers/agency'
import { DRIVERS } from '../src/core/content'

const driver = DRIVERS[0]
const teammate = DRIVERS[1]

describe('driver agency', () => {
  it('fresh multiplayer baseline has no grudges or history', () => {
    const s = freshAgencyState(driver)
    expect(s.memory).toHaveLength(0)
    expect(s.promises).toHaveLength(0)
    expect(s.trustInTeam).toBe(65)
    expect(s.teammateRelationship).toBe(50)
  })

  it('store is championship-scoped: separate stores are isolated', () => {
    const a = new DriverAgencyStore()
    const b = new DriverAgencyStore()
    a.ensure(driver.id, driver)
    a.addMemory(driver.id, driver, 'TEAM_ORDER_AGAINST_DRIVER')
    expect(a.get(driver.id)!.trustInTeam).toBeLessThan(65)
    // Store b never saw the event
    expect(b.get(driver.id)).toBeUndefined()
    expect(b.ensure(driver.id, driver).trustInTeam).toBe(65)
  })

  it('memory events affect trust and morale', () => {
    const store = new DriverAgencyStore()
    store.ensure(driver.id, driver)
    const before = store.get(driver.id)!
    const t0 = before.trustInTeam
    const m0 = before.morale
    store.addMemory(driver.id, driver, 'PROMISE_BROKEN')
    const after = store.get(driver.id)!
    expect(after.trustInTeam).toBeLessThan(t0)
    expect(after.morale).toBeLessThan(m0)
  })

  it('teammate relationship changes apply to both drivers', () => {
    const store = new DriverAgencyStore()
    store.ensure(driver.id, driver)
    store.ensure(teammate.id, teammate)
    store.adjustTeammateRelationship(driver.id, teammate.id, -40)
    expect(store.get(driver.id)!.teammateRelationship).toBe(10)
    expect(store.get(teammate.id)!.teammateRelationship).toBe(10)
    expect(store.teammateState(driver.id)).toBe('Rivals')
  })

  it('memory decays and minor events are pruned', () => {
    const store = new DriverAgencyStore()
    store.ensure(driver.id, driver)
    store.addMemory(driver.id, driver, 'PUBLIC_PRAISE', 0.2)
    for (let i = 0; i < 10; i++) store.tickRound()
    expect(store.get(driver.id)!.memory).toHaveLength(0)
  })

  it('compliance: promised equal status + contender → likely refusal', () => {
    const agency = freshAgencyState(driver)
    agency.promises.push({ description: 'promised equal status', broken: false, round: 0 })
    const res = assessCompliance(driver, agency, 'swap', {
      teammateRelationship: 20, isChampionshipContender: true, positionGap: 0,
    })
    expect(res.compliance).toBeLessThan(30)
    expect(res.reasons).toContain('promised equal status')
    expect(res.reasons).toContain('still in championship contention')
    expect(res.verdict).toBe('Very Unlikely')
  })

  it('compliance: professional driver, good relations → likely compliance', () => {
    const agency = freshAgencyState(driver)
    agency.trustInTeam = 85
    const res = assessCompliance(driver, agency, 'doNotFight', {
      teammateRelationship: 80, isChampionshipContender: false, positionGap: 0,
    })
    expect(res.compliance).toBeGreaterThan(65)
    expect(['Very Likely', 'Likely']).toContain(res.verdict)
  })

  it('compliance verdicts map to readable labels', () => {
    const relationship = relationshipLabel(90)
    expect(relationship).toBe('Close Friends')
    expect(relationshipLabel(5)).toBe('Hostile')
  })
})
