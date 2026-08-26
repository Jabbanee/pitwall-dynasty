import { describe, it, expect } from 'vitest'
import {
  regulationsForYear,
  teamOrderAvailability,
  codedOrderRisk,
  resolveCodedOrder,
  START_YEARS,
} from '../src/regulations/regulations'

describe('regulations engine', () => {
  it('prohibits direct position-swap orders in the 2003–2010 shadow era', () => {
    const regs = regulationsForYear(2007)
    expect(regs.positionSwapOrders).toBe('prohibited')
    expect(regs.teamOrders).toBe('codedOnly')
    const avail = teamOrderAvailability(regs)
    expect(avail.directOrders).toBe('PROHIBITED')
    expect(avail.codedOrders).toBe('RISKY')
    expect(avail.explanation).toContain('prohibited')
  })

  it('allows team orders before 2003 and from 2011 onward', () => {
    expect(regulationsForYear(1998).positionSwapOrders).toBe('allowed')
    expect(regulationsForYear(2012).positionSwapOrders).toBe('allowed')
    expect(teamOrderAvailability(regulationsForYear(1998)).directOrders).toBe('AVAILABLE')
    expect(teamOrderAvailability(regulationsForYear(2012)).directOrders).toBe('AVAILABLE')
  })

  it('era affects points systems and refuelling', () => {
    expect(regulationsForYear(1990).refuelling).toBe(false)
    expect(regulationsForYear(1996).refuelling).toBe(true)
    expect(regulationsForYear(2000).pointsSystem[0]).toBe(10)
    expect(regulationsForYear(2015).pointsSystem[0]).toBe(25)
  })

  it('start era list exposes selectable years', () => {
    expect(START_YEARS.length).toBeGreaterThanOrEqual(7)
    expect(START_YEARS.some((e) => e.eraName.includes('Order Prohibition'))).toBe(true)
  })

  it('coded order risk scales with reputation and repeat offences', () => {
    const regs = regulationsForYear(2007)
    const lowProfile = codedOrderRisk(regs, 30, 0)
    const highProfile = codedOrderRisk(regs, 90, 0)
    const repeatOffender = codedOrderRisk(regs, 90, 3)
    expect(repeatOffender.stewardScrutiny).toBeGreaterThan(highProfile.stewardScrutiny)
    expect(highProfile.stewardScrutiny).toBeGreaterThan(lowProfile.stewardScrutiny)
  })

  it('coded order resolution is deterministic from the roll', () => {
    const regs = regulationsForYear(2007)
    const risk = codedOrderRisk(regs, 80, 0)
    const a = resolveCodedOrder(risk, 0.05)
    const b = resolveCodedOrder(risk, 0.05)
    expect(a).toEqual(b)
    expect(a.investigated).toBe(true)
    const clean = resolveCodedOrder(risk, 0.99)
    expect(clean.investigated).toBe(false)
  })

  it('coded orders are unavailable when orders are fully allowed', () => {
    const risk = codedOrderRisk(regulationsForYear(2015), 90, 2)
    expect(risk.stewardScrutiny).toBe(0)
  })
})
