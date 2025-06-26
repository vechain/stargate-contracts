import { BaseContract } from "ethers";

export const filterEventsByName = (events: any[], eventName: string) => {
  return events.filter((event) => event.fragment && event.fragment.name === eventName);
};

export const decodeEvents = (contract: BaseContract, events: any[]) => {
  return events.map((event) => {
    return decodeEvent(event, contract);
  });
};

export const decodeEvent = (event: any, contract: BaseContract) => {
  return contract.interface.parseLog({
    topics: event.topics,
    data: event.data,
  });
};
