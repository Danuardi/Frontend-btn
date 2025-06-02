import { Address } from "viem";
import POSITIONS_ABI from "./POSITIONS_ABI.json";

export const RPC_URL = `https://backend.mrfql.my.id`;

export const POSITION_ABI = POSITIONS_ABI;

export const POSITION_ADDRESS: Record<number, Address> = {
  50002: "0xB8ACbfeeacf053E85B51D71563A95d3EEcF57984",
} as const;