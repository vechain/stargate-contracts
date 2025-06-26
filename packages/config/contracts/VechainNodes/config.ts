export enum StrengthLevel { // Legacy strengthLevel enum
    None,
    Strength,
    Thunder,
    Mjolnir,
    VeThorX,
    StrengthX,
    ThunderX,
    MjolnirX,
}

export const TokenRipeDays: Record<StrengthLevel, number> = {
    [StrengthLevel.None]: 0,
    [StrengthLevel.Strength]: 10,
    [StrengthLevel.Thunder]: 20,
    [StrengthLevel.Mjolnir]: 30,
    [StrengthLevel.VeThorX]: 0,
    [StrengthLevel.StrengthX]: 30,
    [StrengthLevel.ThunderX]: 60,
    [StrengthLevel.MjolnirX]: 90,
}
