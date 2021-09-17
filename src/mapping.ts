import {RewardAdded, RewardRateChanged} from "../generated/Governor/Governor";
import {Governor, LiquidityMiningDayData} from "../generated/schema"
import {BI_18, convertToDecimal, getPriceFromOracle, ZERO_BD, ZERO_BI} from "./utils";
import {GOVERNOR_ADDRESS, MCB_ORACLE, POOL, POOL_NAME, REWARD_TOKEN} from "./const";
import {BigInt, ethereum} from "@graphprotocol/graph-ts";

export function handleRewardAdded(event: RewardAdded): void {
    let governor = Governor.load(event.address.toHexString())
    if (governor === null) {
        governor = new Governor(event.address.toHexString())
        governor.pool = POOL
        governor.rewardRate = ZERO_BD
        governor.preRewardRate = ZERO_BD
        governor.changeRewardBlock = ZERO_BI
        governor.timestamp = event.block.timestamp.toI32() / 3600 * 3600
    }
    governor.periodFinish = event.params.periodFinish
    governor.save()
}

export function handleRewardRateChanged(event: RewardRateChanged): void {
    let governor = Governor.load(event.address.toHexString())
    if (governor === null) {
        governor = new Governor(event.address.toHexString())
        governor.pool = POOL
        governor.timestamp = event.block.timestamp.toI32() / 3600 * 3600
    }
    governor.rewardRate = convertToDecimal(event.params.currentRate, BI_18)
    governor.preRewardRate = convertToDecimal(event.params.previousRate, BI_18)
    governor.periodFinish = event.params.periodFinish
    governor.changeRewardBlock = event.block.number
    governor.save()
}

export function handleSyncData(block: ethereum.Block): void {
    let governor = Governor.load(GOVERNOR_ADDRESS)
    if (governor === null || governor.preRewardRate == ZERO_BD ||
        governor.periodFinish < block.number) {
        return
    }

    let timestamp = block.timestamp.toI32()
    let hourIndex = timestamp / 3600
    let hourStartUnix = hourIndex * 3600
    if (governor.timestamp == hourStartUnix) {
        return
    }
    governor.timestamp = hourStartUnix

    updateLiquidityMiningDayData(block.timestamp, block.number)
}


export function updateLiquidityMiningDayData(timestamp: BigInt, blockNumber: BigInt): void {
    let dayIndex = timestamp.toI32() / (3600 * 24)
    let dayStartUnix = dayIndex * (3600 * 24)
    let dayLiquidityMiningID = GOVERNOR_ADDRESS
        .concat('-')
        .concat(BigInt.fromI32(dayIndex).toString())
    let liquidityMiningDayData = LiquidityMiningDayData.load(dayLiquidityMiningID)
    if (liquidityMiningDayData === null) {
        liquidityMiningDayData = new LiquidityMiningDayData(dayLiquidityMiningID)
        liquidityMiningDayData.pool = POOL
        liquidityMiningDayData.poolName = POOL_NAME
        liquidityMiningDayData.lastUpdateBlock = blockNumber
        liquidityMiningDayData.timestamp = dayStartUnix
        liquidityMiningDayData.token = REWARD_TOKEN
        liquidityMiningDayData.minedAmount = ZERO_BD
        liquidityMiningDayData.minedValueUSD = ZERO_BD
        liquidityMiningDayData.save()

        let lastDayLiquidityMiningID = GOVERNOR_ADDRESS
            .concat('-')
            .concat(BigInt.fromI32(dayIndex - 1).toString())
        let lastLiquidityMiningDayData = LiquidityMiningDayData.load(lastDayLiquidityMiningID)
        if (lastLiquidityMiningDayData != null) {
            updateLMDayDataIfNotNull(lastLiquidityMiningDayData!, blockNumber)
        }
    } else {
        updateLMDayDataIfNotNull(liquidityMiningDayData!, blockNumber)
    }
}


export function updateLMDayDataIfNotNull(liquidityMiningDayData: LiquidityMiningDayData, blockNumber: BigInt): void {
    let governor = Governor.load(GOVERNOR_ADDRESS)
    let hourReward = ZERO_BD
    let mcbPrice = getPriceFromOracle(MCB_ORACLE)

    if (governor.periodFinish > liquidityMiningDayData.lastUpdateBlock && governor.periodFinish <= blockNumber) {
        if (governor.changeRewardBlock > liquidityMiningDayData.lastUpdateBlock &&
            governor.changeRewardBlock <= governor.periodFinish) {
            let hourReward1 = (governor.changeRewardBlock.minus(liquidityMiningDayData.lastUpdateBlock)).toBigDecimal().times(governor.preRewardRate)
            let hourReward2 = (governor.periodFinish.minus(governor.changeRewardBlock)).toBigDecimal().times(governor.rewardRate)
            hourReward = hourReward1.plus(hourReward2)
        } else if (governor.changeRewardBlock > governor.periodFinish &&
            governor.changeRewardBlock < blockNumber) {
            hourReward = (governor.periodFinish.minus(liquidityMiningDayData.lastUpdateBlock)).toBigDecimal().times(governor.preRewardRate)
        } else {
            hourReward = (governor.periodFinish.minus(liquidityMiningDayData.lastUpdateBlock)).toBigDecimal().times(governor.rewardRate)
        }
    } else if (governor.periodFinish > blockNumber) {
        if (governor.changeRewardBlock > liquidityMiningDayData.lastUpdateBlock &&
            governor.changeRewardBlock < blockNumber) {
            let hourReward1 = (governor.changeRewardBlock.minus(liquidityMiningDayData.lastUpdateBlock)).toBigDecimal().times(governor.preRewardRate)
            let hourReward2 = (blockNumber.minus(governor.changeRewardBlock)).toBigDecimal().times(governor.rewardRate)
            hourReward = hourReward1.plus(hourReward2)
        } else {
            hourReward = (blockNumber.minus(liquidityMiningDayData.lastUpdateBlock)).toBigDecimal().times(governor.rewardRate)
        }
    }
    liquidityMiningDayData.minedAmount = liquidityMiningDayData.minedAmount.plus(hourReward)
    liquidityMiningDayData.minedValueUSD = liquidityMiningDayData.minedValueUSD.plus(hourReward.times(mcbPrice))

    liquidityMiningDayData.lastUpdateBlock = blockNumber
    liquidityMiningDayData.save()
}