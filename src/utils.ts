import {BigInt, BigDecimal, log, Address} from '@graphprotocol/graph-ts'
import {Oracle} from "../generated/Governor/Oracle";

export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)

export function convertToDecimal(amount: BigInt, decimals: BigInt): BigDecimal {
    if (decimals == ZERO_BI) {
        return amount.toBigDecimal()
    }
    return amount.toBigDecimal().div(exponentToBigDecimal(decimals))
}

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
    let bd = BigDecimal.fromString('1')
    for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
        bd = bd.times(BigDecimal.fromString('10'))
    }
    return bd
}

export function getPriceFromOracle(oracle: string): BigDecimal {
    let contract = Oracle.bind(Address.fromString(oracle))
    let callResult = contract.try_priceTWAPShort()
    if (callResult.reverted) {
        log.warning("try_priceTWAPShort reverted. oracle: {}", [oracle])
        return ZERO_BD
    }

    return convertToDecimal(callResult.value.value0, BI_18)
}