import { Address, Abi } from "viem";
import POSITIONS_ABI from "./POSITIONS_ABI.json";

export const RPC_URL = `https://backend.mrfql.my.id`;

export const POSITION_ABI = POSITIONS_ABI as Abi;

export const POSITION_ADDRESS: Record<number, Address> = {
  84532: "0x34662e1BE68A95141550c69c4aD7844EA2314b0D", // Base Sepolia
} as const;