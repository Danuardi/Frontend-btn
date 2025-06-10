import { Address, Abi } from "viem";
import POSITIONS_ABI from "./POSITIONS_ABI.json";

export const RPC_URL = `https://backend.mrfql.my.id`;

export const POSITION_ABI = POSITIONS_ABI as Abi;

export const POSITION_ADDRESS: Record<number, Address> = {
  84532: "0xf63B905B1183D2247D313dbb0750C8226f43C8e9", // Base Sepolia
} as const;
