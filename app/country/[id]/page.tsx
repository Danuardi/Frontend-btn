"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import useSWR from "swr";

import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useBalance,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";

import {
  RPC_URL,
  POSITION_ADDRESS,
  POSITION_ABI,
} from "@/lib/contracts/constants";
import { usePositionsStore } from "@/components/trading/PositionsContext";
import HistoryTable from "@/components/dashboard/HistoryTable";
import { fetcher } from "@/src/services/fetcher";

export default function CountryPage() {
  const { id } = useParams();
  const countryId = typeof id === "string" ? id.toUpperCase() : "";

  // Define interface for Position data returned from smart contract
  interface PositionData {
    positionId: bigint;
    countryId: string;
    trader: `0x${string}`;
    direction: number;
    size: bigint;
    leverage: number;
    entryPrice: bigint;
    openTime: bigint;
    takeProfit: bigint;
    stopLoss: bigint;
    isOpen: boolean;
    liquidationPrice: bigint;
  }

  const [previousBalance, setPreviousBalance] = useState<number | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const { data, error, isLoading } = useSWR(
    countryId ? `${RPC_URL}/api/v1/country/${countryId}/trade` : null,
    fetcher
  );

  const country = React.useMemo(() => {
    if (!data?.data) return null;
    const d = data.data;
    return {
      name: d.name,
      flagCode: d.code?.toLowerCase() || "",
      countryScore: d.tradingMetrics?.countryScore ?? 0,
      volume24h: d.tradingMetrics?.volume24h ?? "-",
      indexPrice: d.marketInfo?.indexPrice ?? "-",
      sentiment: d.marketInfo?.sentiment ?? "-",
      trend: d.marketInfo?.trend ?? "-",
      markPrice: d.marketInfo?.markPrice ?? "-",
      fundingRate: d.marketInfo?.fundingRate ?? "-",
      openInterest: d.marketInfo?.openInterest ?? "-",
      openTrades: d.tradingMetrics?.openTrades ?? "-",
      volumes: d.tradingMetrics?.volume24h ?? "-",
      fundingCooldown: d.tradingMetrics?.fundingCooldown ?? "-",
      fundingPercent: d.marketInfo?.fundingRate ?? "-",
      description: d.about ?? "-",
      liquidationPrice: d.marketInfo?.liquidationPrice ?? "-",
    };
  }, [data]);

  const [transactionStep, setTransactionStep] = useState<'idle' | 'approving' | 'trading' | 'success' | 'error'>('idle');

  interface TradePosition {
    size: string;
    leverage: string;
    isLong: boolean;
    entryPrice: number;
    isOpen?: boolean;
  }

  const [position, setPosition] = useState<TradePosition>({
    size: "",
    leverage: "1",
    isLong: true,
    entryPrice: 0,
  });

  const [showPosition, setShowPosition] = useState(false);
  const [closeStep, setCloseStep] = useState<1 | 2 | 3 | 4 | 99 | null>(null);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const { address } = useAccount();
  const { data: walletBalance, refetch: refetchBalance } = useBalance({
    address,
  });

  const { triggerRefresh } = usePositionsStore();

  const { refetch: refetchPositionFromHook } = useReadContract({
    address: POSITION_ADDRESS[84532],
    abi: POSITION_ABI,
    functionName: "getPosition",
    args: [countryId, address] as const,
    account: address,
  }) as { refetch: () => Promise<{ data: PositionData | undefined }> };

  const refetchPosition = () => {
    if (address) {
      return refetchPositionFromHook();
    }
    return Promise.resolve();
  };

  // Helper to calculate PnL, percentage, and fees
  const getPnLInfo = () => {
    const entry = parseFloat(country?.markPrice || "0");
    const mark = parseFloat(country?.markPrice || "0"); // Replace with actual mark price if available
    const size = parseFloat(position?.size || "0");
    const isLong = position?.isLong;

    if (!entry || !mark || !size) {
      return {
        pnl: 0,
        percentage: 0,
        fees: 0,
        isProfit: true,
      };
    }

    // Example calculation (replace with your actual logic)
    const priceDiff = isLong ? mark - entry : entry - mark;
    const pnl = priceDiff * size;
    const percentage = entry ? (priceDiff / entry) * 100 : 0;
    const fees = size * 0.0025; // Example: 0.25% fee

    return {
      pnl,
      percentage,
      fees,
      isProfit: pnl >= 0,
    };
  };

  useEffect(() => {
    if (hash && !isConfirming) {
      const savedSize = position.size;
      setPosition({
        size: savedSize,
        leverage: "1",
        isLong: true,
        entryPrice: 120,
      });
      setShowPosition(true);

      document
        .querySelector("#positions-panel")
        ?.scrollIntoView({ behavior: "smooth" });

      const timer = setTimeout(() => {
        refetchBalance().catch((err) =>
          console.error("Failed to refresh balance:", err)
        );
        triggerRefresh();
      }, 3500);

      return () => clearTimeout(timer);
    }
  }, [hash, isConfirming, refetchBalance, triggerRefresh, position.size]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (address) {
        refetchBalance();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [address, refetchBalance]);

  const handlePlaceTrade = async () => {
    try {
      setTransactionStep('trading');
      
      if (!id || typeof id !== "string") {
        throw new Error("Country ID is required");
      }

      if (!address) {
        throw new Error("Wallet not connected");
      }

      // Check ETH balance
      if (!walletBalance || Number(formatUnits(walletBalance.value, walletBalance.decimals)) < Number(position.size)) {
        throw new Error(`Insufficient ETH balance. Required: ${position.size} ETH, Available: ${walletBalance ? formatUnits(walletBalance.value, walletBalance.decimals) : '0'} ETH`);
      }

      // Validate position parameters
      if (!position.size || Number(position.size) <= 0) {
        throw new Error("Position size must be greater than 0");
      }

      if (Number(position.leverage) < 1 || Number(position.leverage) > 5) {
        throw new Error("Leverage must be between 1 and 5");
      }

      // Convert ETH amount to wei
      const sizeInWei = parseUnits(position.size, 18);

      console.log("Opening position with parameters:", {
        country: id,
        direction: position.isLong ? 0 : 1,
        leverage: Number(position.leverage),
        value: sizeInWei.toString(),
        address: address
      });

      // Check if position already exists
      try {
        const existingPosition = await refetchPositionFromHook();
        console.log("Existing position:", existingPosition.data);
        
        if (existingPosition.data && existingPosition.data.isOpen) {
          throw new Error("Position already exists. Close your current position before opening a new one.");
        }
      } catch (positionCheckError) {
        console.log("Position check result:", positionCheckError);
        // Continue if position doesn't exist or check fails
      }

      // Open Position with ETH
      const tradeTx = await writeContract({
        address: POSITION_ADDRESS[84532],
        abi: POSITION_ABI,
        functionName: "openPosition",
        args: [
          id,
          position.isLong ? 0 : 1,
          parseInt(position.leverage), // Ensure it's an integer
        ],
        value: sizeInWei, // Send ETH with the transaction
      });
      console.log("Trade TX:", tradeTx);

      setTransactionStep('success');

      setPosition({
        ...position,
        entryPrice: country?.markPrice,
      });

      // Refresh position data explicitly
      refetchPosition().catch((err) =>
        console.error("Failed to refresh position:", err)
      );
      refetchBalance().catch((err: Error) =>
        console.error("Failed to refresh balance:", err)
      );
      triggerRefresh();
    } catch (error) {
      setTransactionStep('error');
      console.error("Error placing trade:", error);
      
      // Enhanced error handling to capture revert reasons
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        if (error.message.includes("revert")) {
          // Try to extract the revert reason
          const revertMatch = error.message.match(/revert (.+)/);
          if (revertMatch) {
            alert("Transaction failed: " + revertMatch[1]);
          } else {
            alert("Transaction reverted: " + error.message);
          }
        } else {
          alert("Failed to trade: " + error.message);
        }
      } else {
        console.error("Unknown error:", error);
        alert("Failed to trade: " + JSON.stringify(error));
      }
    } finally {
      // Reset transaction step after a delay
      setTimeout(() => setTransactionStep('idle'), 3000);
    }
  };

  const isProcessing = isPending || isConfirming;

  const handleCloseStepContinue = async () => {
    if (closeStep === 1) {
      setCloseStep(2); // Go to step 2
    } else if (closeStep === 2) {
      setCloseStep(3);
      if (walletBalance) {
        setPreviousBalance(Number(walletBalance.formatted));
        const { pnl, fees } = getPnLInfo();
        setNewBalance(Number(walletBalance.formatted) + pnl - fees);
      }
    } else if (closeStep === 3) {
      setCloseStep(4); // Go to step 4
    } else if (closeStep === 4) {
      // Close position using user's address
      try {
        if (address) {
          await writeContract({
            address: POSITION_ADDRESS[84532],
            abi: POSITION_ABI,
            functionName: "closePosition",
            args: [
              address,
            ],
          });
        } else {
          throw new Error("Wallet address not available");
        }
      } catch (error) {
        console.error("Error closing position:", error);
        // Handle error appropriately
      }
      setCloseStep(99); // Go to history table
      setShowPosition(false);
    } else if (closeStep === 99) {
      setCloseStep(null); // Close the entire flow
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen text-white">
        Loading country data...
      </div>
    );
  }

  if (error || !country) {
    return (
      <div className="flex justify-center items-center min-h-screen text-white">
        Country not found or failed to load.
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto p-2 sm:p-6 bg-[#111214] min-h-screen">
        {/* Back to Dashboard button */}
        <Link href="/dashboard" className="block mb-4 sm:mb-8">
          <div className="inline-flex justify-start items-center gap-[12px] sm:gap-[23px]">
            <div className="w-[45px] h-[45px] sm:w-[58px] sm:h-[58px] p-[9.67px] bg-[#1d1f22] rounded-[9.67px] flex justify-center items-center">
              <svg
                width="24.72"
                height="42.9"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="scale-[1.2]"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M14.0274 21.1391C13.7253 20.8369 13.5557 20.4272 13.5557 20C13.5557 19.5728 13.7253 19.1631 14.0274 18.8609L23.1414 9.74689C23.2901 9.59301 23.4678 9.47027 23.6644 9.38584C23.861 9.3014 24.0724 9.25696 24.2863 9.2551C24.5002 9.25324 24.7124 9.294 24.9104 9.37501C25.1084 9.45602 25.2882 9.57565 25.4395 9.72692C25.5908 9.87819 25.7104 10.0581 25.7914 10.2561C25.8724 10.4541 25.9132 10.6662 25.9113 10.8801C25.9095 11.0941 25.865 11.3055 25.7806 11.502C25.6962 11.6986 25.5734 11.8764 25.4195 12.025L17.4445 20L25.4195 27.975C25.713 28.2789 25.8754 28.6858 25.8717 29.1083C25.8681 29.5307 25.6986 29.9348 25.3999 30.2335C25.1012 30.5322 24.6971 30.7016 24.2747 30.7053C23.8523 30.709 23.4453 30.5466 23.1414 30.2531L14.0274 21.1391Z"
                  fill="white"
                />
              </svg>
            </div>
            <div className="text-right justify-start text-[#d6d6d6] text-base sm:text-xl font-medium font-['Inter'] leading-tight">
              Back To Dashboard
            </div>
          </div>
        </Link>

        <div className="space-y-4 sm:space-y-6">
          {/* Header Panel */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 px-4 sm:px-9 py-4 sm:py-[18.86px] bg-[#1d1f22] rounded-xl shadow-[0px_0.7857142686843872px_1.5714285373687744px_0px_rgba(16,24,40,0.06)] shadow-[0px_0.7857142686843872px_2.357142925262451px_0px_rgba(16,24,40,0.10)] outline outline-[0.79px] outline-offset-[-0.79px] outline-[#323232] transition-all duration-200 hover:shadow-lg">
            {/* Flag Section */}
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="w-[50px] h-[50px] sm:w-[62.29px] sm:h-[62.29px] relative">
                <div className="absolute inset-0 rounded-full overflow-hidden bg-[#d7d7d7]">
                  <Image
                    src={`https://flagcdn.com/w160/${country.flagCode.toLowerCase()}.png`}
                    alt={`${country.name} flag`}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover scale-110"
                    priority
                  />
                </div>
              </div>

              {/* Country Info Section */}
              <div className="flex flex-col gap-[8px] sm:gap-[13px]">
                <div className="text-white text-xl sm:text-[25.14px] font-medium font-['Inter'] leading-snug">
                  {country.name}
                </div>
                <div className="text-[#70e000] text-lg sm:text-xl font-medium font-['Inter'] leading-snug">
                  {country.countryScore}
                </div>
              </div>
            </div>

            {/* Stats Section */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-8 w-full sm:w-auto mt-4 sm:mt-0">
              {/* Open Trades */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#ffe5664D] rounded-[100px] flex items-center justify-center">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.00004 14.6666H10C13.3334 14.6666 14.6667 13.3333 14.6667 9.99992V5.99992C14.6667 2.66659 13.3334 1.33325 10 1.33325H6.00004C2.66671 1.33325 1.33337 2.66659 1.33337 5.99992V9.99992C1.33337 13.3333 2.66671 14.6666 6.00004 14.6666Z"
                      stroke="#ffa200"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4.88666 9.66683L6.47332 7.72016C6.70666 7.4335 7.13332 7.38683 7.42666 7.62016L8.63332 8.62016C8.92666 8.8535 9.35332 8.80683 9.58666 8.52683L11.1133 6.66683"
                      stroke="#ffa200"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <div className="text-[#697485] text-sm font-normal font-['Inter'] leading-tight">
                    Open Trades
                  </div>
                  <div className="text-white text-sm font-medium font-['Inter'] leading-tight">
                    {country.openTrades}
                  </div>
                </div>
              </div>

              {/* Volumes */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#60b6fb4D] rounded-[100px] flex items-center justify-center">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.66671 14.6667H9.33337C12.6667 14.6667 14 13.3334 14 10V6.66671C14 3.33337 12.6667 2.00004 9.33337 2.00004H6.66671C3.33337 2.00004 2.00004 3.33337 2.00004 6.66671V10C2.00004 13.3334 3.33337 14.6667 6.66671 14.6667Z"
                      stroke="#072ac8"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10.5 6.66663H5.5"
                      stroke="#072ac8"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10.5 9.33337H5.5"
                      stroke="#072ac8"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <div className="text-[#697485] text-sm font-normal font-['Inter'] leading-tight">
                    Volumes
                  </div>
                  <div className="text-white text-sm font-medium font-['Inter'] leading-tight">
                    {country.volumes}
                  </div>
                </div>
              </div>

              {/* Funding/Cooldown */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#ff45454D] rounded-[100px] flex items-center justify-center">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M14.6667 8C14.6667 11.68 11.68 14.6667 8 14.6667C4.32 14.6667 1.33333 11.68 1.33333 8C1.33333 4.32 4.32 1.33333 8 1.33333C11.68 1.33333 14.6667 4.32 14.6667 8Z"
                      stroke="#ff4545"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 5.33333V8.66666"
                      stroke="#ff4545"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7.99667 10.6667H8.00267"
                      stroke="#ff4545"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <div className="text-[#697485] text-sm font-normal font-['Inter'] leading-tight">
                    Funding/Cooldown
                  </div>
                  <div>
                    <span className="text-[#16b264] text-sm font-medium font-['Inter'] leading-tight">
                      {country.fundingPercent}{" "}
                    </span>
                    <span className="text-white text-sm font-medium font-['Inter'] leading-tight">
                      {country.fundingCooldown}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Chart Panel */}
            <div className="lg:col-span-2 w-full h-[300px] sm:h-[400px] lg:h-[520px] p-4 sm:p-6 bg-[#1d1f22] rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.06)] shadow-[0px_1px_3px_0px_rgba(16,24,40,0.10)] outline outline-1 outline-offset-[-1px] outline-[#323232] inline-flex flex-col justify-start items-start gap-4 sm:gap-5 overflow-hidden transition-all duration-200 hover:shadow-lg">
              <div className="self-stretch inline-flex justify-between items-center">
                <div className="flex-1 justify-start text-white text-lg font-medium font-['Inter'] leading-7">
                  Live Countryscore
                </div>
                <div className="justify-start text-[#70e000] text-xl font-medium font-['Inter'] leading-snug">
                  {country.countryScore}
                </div>
              </div>
              <div className="self-stretch flex-1 inline-flex justify-start items-start">
                <div className="flex-1 self-stretch relative">
                  {/* Chart grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none z-0">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-0 border-t border-[#323232] opacity-70" />
                    ))}
                  </div>

                  {/* Line Chart SVG */}
                  <svg className="absolute inset-0 w-full h-full z-10" preserveAspectRatio="none" viewBox="0 0 800 400">
                    <defs>
                      <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#70E000" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#70E000" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {/* Area under the line */}
                    <path
                      d="M40,280 L100,200 L160,240 L220,180 L280,220 L340,160 L400,190 L460,150 L520,180 L580,140 L640,170 L700,130 L760,150 L760,350 L40,350 Z"
                      fill="url(#greenGradient)"
                    />

                    {/* Main line */}
                    <path
                      d="M40,280 L100,200 L160,240 L220,180 L280,220 L340,160 L400,190 L460,150 L520,180 L580,140 L640,170 L700,130 L760,150"
                      stroke="#70E000"
                      strokeWidth="2"
                      fill="none"
                    />

                    {/* Data points - Responsive sizing */}
                    {[
                      [40, 280], [100, 200], [160, 240], [220, 180], [280, 220], [340, 160],
                      [400, 190], [460, 150], [520, 180], [580, 140], [640, 170], [700, 130], [760, 150],
                    ].map(([x, y], i) => (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r="2"
                        fill="#70E000"
                        className="sm:r-3 lg:r-4"
                      />
                    ))}
                  </svg>

                  {/* X-axis labels - Responsive padding */}
                  <div className="absolute bottom-0 left-0 w-full px-2 sm:px-4 lg:px-6 flex justify-between items-center z-20">
                    {/* X-axis labels would go here if needed */}
                  </div>
                </div>

                {/* Y-axis section - Fully responsive */}
                <div className="w-6 sm:w-8 lg:w-[47px] self-stretch flex flex-col justify-between items-end pl-1 sm:pl-2 lg:pl-3 relative">
                  {/* Vertical line - Hidden on mobile */}
                  <div className="hidden lg:block absolute right-0 top-0 h-full w-px bg-[#323232]" />

                  {/* Y-axis labels - Mobile optimized */}
                  <div className="flex flex-col justify-between h-full py-1 sm:py-2 gap-1 sm:gap-0">
                    {[
                      "2500", "2300", "2000", "1800", "1600",
                      "1400", "1200", "1100", "900"
                    ].map((value, index) => (
                      <div
                        key={value}
                        className="text-[#697485] text-[10px] sm:text-xs font-normal font-['Inter'] leading-tight text-right whitespace-nowrap"
                        style={{
                          transform: `translateY(${index === 0 ? '0' :
                            index === 8 ? '-100%' :
                              '-50%'
                            })`
                        }}
                      >
                        {/* Show abbreviated values on mobile */}
                        <span className="block sm:hidden">
                          {value.length > 4 ? `${value.slice(0, 2)}k` : value}
                        </span>
                        <span className="hidden sm:block">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Trading Panel */}
            <div className="self-stretch p-4 sm:p-6 bg-[#1d1f22] rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.06)] shadow-[0px_1px_3px_0px_rgba(16,24,40,0.10)] outline outline-1 outline-offset-[-1px] outline-[#323232] inline-flex flex-col justify-start items-start gap-4 sm:gap-6 transition-all duration-200 hover:shadow-lg">
              <div className="self-stretch px-2.5 py-2 bg-[#2d2d2e] rounded-[100px] flex">
                <div className="self-stretch h-[40px] sm:h-[45px] flex-1 flex items-center relative"> {/* Made even smaller for mobile */}
                  <div
                    className={`absolute inset-0 transition-all duration-300 ease-in-out flex ${position.isLong ? "justify-start" : "justify-end"
                      }`}
                  >
                    <div
                      className={`h-full w-1/2 ${position.isLong ? "bg-[#16b264]" : "bg-[#FF4B4B]"
                        } rounded-[100px] shadow-[0px_1px_2px_0px_rgba(16,24,40,0.06)] shadow-[0px_1px_3px_0px_rgba(16,24,40,0.10)]`}
                    />
                  </div>
                  <div
                    className={`flex-1 z-10 px-[8px] sm:px-[12px] py-[6px] sm:py-[10px] flex justify-center items-center gap-[8px] sm:gap-[12px] cursor-pointer transition-colors duration-300`} /* Even smaller padding for mobile */
                    onClick={() => setPosition({ ...position, isLong: true })}
                  >
                    <div className="flex items-center gap-1 sm:gap-1.5"> {/* Smaller gap for mobile */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-4 h-4 sm:w-5 sm:h-5" /* Even smaller icon for mobile */
                      >
                        <path
                          fillRule="evenodd"
                          d="M12 20.25a.75.75 0 01-.75-.75V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l6.75-6.75a.75.75 0 011.06 0l6.75 6.75a.75.75 0 11-1.06 1.06l-5.47-5.47V19.5a.75.75 0 01-.75.75z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-base sm:text-lg font-medium font-['Inter'] leading-snug">Long</span> {/* Smaller text for mobile */}
                    </div>
                  </div>
                  <div
                    className={`flex-1 z-10 px-[8px] sm:px-[12px] py-[6px] sm:py-[10px] flex justify-center items-center gap-[8px] sm:gap-[12px] cursor-pointer transition-colors duration-300 ${position.isLong ? "text-white" : "text-[#545454]"
                      }`}
                    onClick={() => setPosition({ ...position, isLong: false })}
                  >
                    <div className="flex items-center gap-1 sm:gap-2"> {/* Smaller gap for mobile */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-4 h-4 sm:w-6 sm:h-6" /* Smaller icon for mobile */
                      >
                        <path
                          fillRule="evenodd"
                          d="M12 3.75a.75.75 0 01.75.75v13.19l5.47-5.47a.75.75 0 111.06 1.06l-6.75 6.75a.75.75 0 01-1.06 0l-6.75-6.75a.75.75 0 111.06-1.06l5.47 5.47V4.5a.75.75 0 01.75-.75z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-base sm:text-xl font-medium font-['Inter'] leading-snug">
                        Short
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="self-stretch flex-1 flex flex-col justify-start items-start gap-2.5">
                <div className="self-stretch flex-1 bg-[#1d1f22] rounded shadow-[0px_0.7857142686843872px_1.5714285373687744px_0px_rgba(16,24,40,0.06)] shadow-[0px_0.7857142686843872px_2.357142925262451px_0px_rgba(16,24,40,0.10)] flex flex-col justify-between items-start">
                  <div className="self-stretch flex flex-col justify-start items-start gap-[18px]">
                    <div className="self-stretch inline-flex justify-start items-center gap-[12.57px]">
                      <div className="flex-1 justify-start text-white text-lg font-medium font-['Inter'] leading-snug">
                        Market
                      </div>
                    </div>
                    <div className="self-stretch inline-flex justify-start items-start gap-[19px]">
                      <div className="flex-1 flex justify-start items-center gap-[12.57px]">
                        <div className="flex-1 justify-start min-w-0"> {/* Add min-w-0 */}
                          <span className="text-[#666666] text-sm sm:text-base font-medium font-['Inter'] leading-snug">
                            Balance :{" "}
                          </span>
                          <span className="text-white text-sm sm:text-base font-medium font-['Inter'] leading-snug break-all"> {/* Add break-all */}
                            {!mounted
                              ? "Loading..."
                              : address
                                ? walletBalance
                                  ? `${Number(walletBalance.formatted).toFixed(
                                    4
                                  )} ${walletBalance.symbol}`
                                  : "Loading..."
                                : "Connect Wallet"}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-start items-center gap-[12.57px]">
                        <div className="justify-start text-[#666666] text-sm sm:text-base font-medium font-['Inter'] leading-snug cursor-pointer whitespace-nowrap"> {/* Add whitespace-nowrap */}
                          Deposit Funds
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="self-stretch h-[50px] sm:h-[63px] px-3 sm:px-[22px] py-1.5 bg-[#2d2e2e] rounded-[100px] shadow-[inset_1px_2px_2px_0px_rgba(0,0,0,0.08)] inline-flex justify-end items-center gap-1">
                    <input
                      type="number"
                      value={position.size}
                      onChange={(e) =>
                        setPosition({ ...position, size: e.target.value })
                      }
                      placeholder="0.00"
                      className={`flex-1 bg-transparent text-left outline-none border-none ${position.size ? "text-white" : "text-red-500"
                        } text-lg sm:text-xl font-bold font-['Inter'] leading-tight min-w-0`}
                    />
                    <div className="text-[#d6d6d6] text-lg sm:text-xl font-bold font-['Inter'] leading-tight whitespace-nowrap">
                      USDC
                    </div>
                  </div>
                  <div className="self-stretch py-4 sm:py-6 relative inline-flex justify-start items-center gap-3">
                    <div className="flex-1 h-1 bg-[#2d2e2e] rounded-full relative">
                      <div
                        className="absolute h-full bg-gradient-to-r from-[#155dee] to-[#45b3ff] rounded-full transition-all duration-200"
                        style={{
                          width: `${((Number(position.leverage) - 1) / 4) * 100}%`,
                        }}
                      />
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={position.leverage}
                        onChange={(e) =>
                          setPosition({ ...position, leverage: e.target.value })
                        }
                        className="absolute inset-0 w-full opacity-0 cursor-pointer z-20"
                      />
                      {[1, 2, 3, 4, 5].map((value) => (
                        <div
                          key={value}
                          className="absolute top-1/2 -translate-y-1/2 -ml-1 z-10"
                          style={{ left: `${((value - 1) / 4) * 100}%` }}
                        >
                          <div
                            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-200 ${value <= Number(position.leverage)
                              ? "bg-white shadow-[0_0_8px_rgba(21,93,238,0.5)]"
                              : "bg-[#404040]"
                              }`}
                          />
                        </div>
                      ))}
                      <div
                        className="absolute -top-2 sm:-top-3 -ml-2 sm:-ml-3 z-10 transition-all duration-200"
                        style={{
                          left: `${((Number(position.leverage) - 1) / 4) * 100}%`,
                        }}
                      >
                        <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-gradient-to-b from-[#155dee] to-[#45b3ff] shadow-[0_0_10px_rgba(21,93,238,0.5)] flex items-center justify-center">
                          <div className="w-1 h-1 sm:w-2 sm:h-2 bg-white rounded-full" />
                        </div>
                      </div>
                    </div>
                    <div className="w-8 sm:w-12 flex justify-center items-center">
                      <div className="text-center text-[#717171] text-base sm:text-xl font-medium font-['Inter'] leading-normal bg-[#2d2e2e] px-2 sm:px-3 py-1 rounded-full">
                        x{position.leverage}
                      </div>
                    </div>
                  </div>
                  <div className="self-stretch inline-flex justify-center items-center">
                    <div className="w-full py-4 flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8">
                      <div className="w-full sm:w-[202px] flex justify-center items-center gap-3">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white rounded-[100px] flex items-center justify-center">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-[#16b2644D] rounded-[100px] flex items-center justify-center">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M8 14.6667C11.68 14.6667 14.6667 11.68 14.6667 8C14.6667 4.32 11.68 1.33333 8 1.33333C4.32 1.33333 1.33333 4.32 1.33333 8C1.33333 11.68 4.32 14.6667 8 14.6667Z"
                                stroke="#16b264"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M5.33333 8L7.33333 10L10.6667 6.66667"
                                stroke="#16b264"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                        </div>
                        <div className="flex-1 sm:w-[181px] inline-flex flex-col justify-start items-start">
                          <div className="self-stretch justify-start text-[#697485] text-xs sm:text-sm font-medium font-['Inter'] leading-tight">
                            Size - Entry Price
                          </div>
                          <div className="self-stretch justify-start text-white text-xs sm:text-sm font-medium font-['Inter'] leading-tight break-all">
                            ${position.size} (${Number(position.size) * Number(position.leverage)} leveraged) at {country.markPrice}
                          </div>
                        </div>
                      </div>
                      <div className="w-full sm:w-[132px] py-4 flex justify-start items-center gap-8">
                        <div className="flex-1 flex justify-start items-center gap-3">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white rounded-[100px] flex items-center justify-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="w-5 h-5"
                            >
                              <path
                                fillRule="evenodd"
                                d="M3.75 12a.75.75 0 01.75-.75h15a.75.75 0 010 1.5h-15a.75.75 0 01-.75-.75z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <div className="flex-1 inline-flex flex-col justify-start items-start">
                            <div className="self-stretch justify-start text-[#697485] text-xs sm:text-sm font-medium font-['Inter'] leading-tight">
                              Liquidated at
                            </div>
                            <div className="self-stretch justify-start text-white text-xs sm:text-sm font-medium font-['Inter'] leading-tight">
                              {country.liquidationPrice}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    className={`self-stretch h-[60px] px-4 py-2 ${position.size && !isProcessing && transactionStep === 'idle'
                      ? "bg-[#155dee]"
                      : "bg-gray-600"
                      } rounded-[100px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.12)] inline-flex justify-center items-center gap-1`}
                    disabled={!position.size || isProcessing || transactionStep !== 'idle'}
                    onClick={handlePlaceTrade}
                  >
                    <div className="text-center justify-center text-white text-xl font-medium font-['Inter'] leading-normal">
                      {transactionStep === 'approving' 
                        ? "Approving USDC..." 
                        : transactionStep === 'trading' 
                        ? "Opening Position..." 
                        : transactionStep === 'success'
                        ? "Success!"
                        : transactionStep === 'error'
                        ? "Failed - Try Again"
                        : isProcessing 
                        ? "Processing..." 
                        : "Place Trade"}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mt-4 sm:mt-6">
            {/* About Panel */}
            <div className="self-stretch p-4 sm:p-6 bg-[#1d1f22] rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.06)] shadow-[0px_1px_3px_0px_rgba(16,24,40,0.10)] outline outline-1 outline-offset-[-1px] outline-[#323232] inline-flex flex-col justify-start items-start gap-4 sm:gap-5 transition-all duration-200 hover:shadow-lg">
              <div className="self-stretch inline-flex justify-start items-center gap-4">
                <div className="flex-1 justify-start text-white text-lg font-medium font-['Inter'] leading-7">
                  About
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-6 h-6 text-[#99a3b2]"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 6a2 2 0 11-4 0 2 2 0 014 0zM12 12a2 2 0 11-4 0 2 2 0 014 0zM12 18a2 2 0 11-4 0 2 2 0 014 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="self-stretch inline-flex justify-start items-center gap-4">
                <div className="flex-1 justify-start text-[#676767] text-lg font-medium font-['Inter'] leading-7">
                  {country.description}
                </div>
              </div>
            </div>

            {/* Leaderboard Panel */}
            <div className="self-stretch h-[380px] sm:h-[407px] p-4 sm:p-6 bg-[#1d1f22] rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.06)] shadow-[0px_1px_3px_0px_rgba(16,24,40,0.10)] outline outline-1 outline-offset-[-1px] outline-[#323232] inline-flex flex-col justify-start items-start gap-4 sm:gap-5 transition-all duration-200 hover:shadow-lg">
              <div className="self-stretch inline-flex justify-start items-center gap-4">
                <div className="flex-1 justify-start text-white text-lg font-medium font-['Inter'] leading-7">
                  Leaderboard
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-6 h-6 text-[#99a3b2]"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 6a2 2 0 11-4 0 2 2 0 014 0zM12 12a2 2 0 11-4 0 2 2 0 014 0zM12 18a2 2 0 11-4 0 2 2 0 014 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="self-stretch inline-flex justify-start items-center gap-4">
                <div className="flex-1 justify-start text-[#676767] text-lg font-medium font-['Inter'] leading-7">
                  You are ranked 167th in Indonesia
                </div>
              </div>
              <div className="self-stretch flex-1 flex flex-col justify-start items-start">
                <div className="self-stretch h-px relative">
                  <div className="w-[399px] h-px left-0 top-0 absolute bg-[#323232]" />
                </div>
                <div className="self-stretch py-4 inline-flex justify-between items-center">
                  <div className="w-[244px] flex justify-between items-center">
                    <div className="justify-start text-[#697485] text-sm font-normal font-['Inter'] leading-tight">
                      Rank #1
                    </div>
                    <div className="flex justify-start items-center gap-3">
                      <Image
                        className="w-[33px] h-8 rounded-[100px]"
                        src="/sarah.jpg"
                        alt="Profile 1"
                        width={33}
                        height={32}
                      />
                      <div className="justify-start text-white text-sm font-medium font-['Inter'] leading-tight">
                        0xMeiline
                      </div>
                    </div>
                  </div>
                  <div className="justify-start text-[#16b264] text-sm font-normal font-['Inter'] leading-tight">
                    $250,000
                  </div>
                </div>
                <div className="self-stretch h-px bg-[#323232]" />
                <div className="self-stretch py-4 inline-flex justify-between items-center">
                  <div className="w-[231px] flex justify-between items-center">
                    <div className="justify-start text-[#697485] text-sm font-normal font-['Inter'] leading-tight">
                      Rank #2
                    </div>
                    <div className="flex justify-start items-center gap-3">
                      <Image
                        className="w-[33px] h-8 rounded-[100px]"
                        src="/john.jpg"
                        alt="Profile 2"
                        width={33}
                        height={32}
                      />
                      <div className="justify-start text-white text-sm font-medium font-['Inter'] leading-tight">
                        0xClara
                      </div>
                    </div>
                  </div>
                  <div className="justify-start text-[#16b264] text-sm font-normal font-['Inter'] leading-tight">
                    $12,000
                  </div>
                </div>
                <div className="self-stretch h-px relative">
                  <div className="w-[399px] h-px left-0 top-0 absolute bg-[#323232]" />
                </div>
                <div className="self-stretch py-4 inline-flex justify-between items-center">
                  <div className="w-[247px] flex justify-between items-center">
                    <div className="justify-start text-[#697485] text-sm font-normal font-['Inter'] leading-tight">
                      Rank #3
                    </div>
                    <div className="flex justify-start items-center gap-3">
                      <Image
                        className="w-[33px] h-8 rounded-[100px]"
                        src="/david.jpg"
                        alt="Profile 3"
                        width={33}
                        height={32}
                      />
                      <div className="justify-start text-white text-sm font-medium font-['Inter'] leading-tight">
                        0xEdward
                      </div>
                    </div>
                  </div>
                  <div className="justify-start text-[#16b264] text-sm font-normal font-['Inter'] leading-tight">
                    $10,000
                  </div>
                </div>
                <div className="self-stretch h-px relative">
                  <div className="w-[399px] h-px left-0 top-0 absolute bg-[#323232]" />
                </div>
                <div className="self-stretch py-4 inline-flex justify-between items-center">
                  <div className="w-60 flex justify-between items-center">
                    <div className="justify-start text-white text-sm font-semibold font-['Inter'] leading-tight">
                      Rank #167
                    </div>
                    <div className="flex justify-start items-center gap-3">
                      <Image
                        className="w-[33px] h-8 rounded-[100px]"
                        src="/placeholder-user.jpg"
                        alt="Profile 4"
                        width={33}
                        height={32}
                      />
                      <div className="justify-start text-white text-sm font-medium font-['Inter'] leading-tight">
                        0xCeline
                      </div>
                    </div>
                  </div>
                  <div className="justify-start text-[#16b264] text-sm font-normal font-['Inter'] leading-tight">
                    $1,000
                  </div>
                </div>
                <div className="self-stretch h-px relative" />
                <div className="self-stretch h-px relative" />
              </div>
            </div>

            {/* Positions Panel */}
            <div id="positions-panel" className="self-stretch p-4 sm:p-6 bg-[#1d1f22] rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.06)] shadow-[0px_1px_3px_0px_rgba(16,24,40,0.10)] outline outline-1 outline-offset-[-1px] outline-[#323232] flex flex-col justify-start items-start gap-4 sm:gap-5 min-h-[300px] sm:min-h-[400px]">
              <div className="w-full flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
                <div className="text-white text-lg font-medium font-['Inter'] leading-7">
                  Positions
                </div>
                {showPosition && closeStep === null && (
                  <button
                    className="w-full sm:w-auto px-4 py-2 rounded-full bg-[#155dee] hover:bg-[#0d4bc4] transition-colors duration-200 flex justify-center items-center gap-2 cursor-pointer"
                    onClick={() => setCloseStep(1)}
                  >
                    <span className="text-white text-sm sm:text-base font-semibold">
                      Close Position
                    </span>
                  </button>
                )}
              </div>

              <div className="w-full flex-1">
                {showPosition && closeStep === null ? (
                  <div className="w-full flex flex-col justify-start items-start space-y-3">
                    <div className="w-full h-px bg-[#323232]" />

                    {/* Position Header */}
                    <div className="w-full py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-[#155dee] rounded-full" />
                        <span className="text-[#697485] text-sm font-medium">
                          {country.name}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${position.isLong
                          ? 'bg-[#16b264] bg-opacity-20 text-[#16b264]'
                          : 'bg-[#ff4545] bg-opacity-20 text-[#ff4545]'
                          }`}>
                          {position.isLong ? 'LONG' : 'SHORT'}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-[#b21616] text-sm font-normal">
                          -$0.24 (-0.0%)
                        </div>
                      </div>
                    </div>

                    {/* Position Details */}
                    <div className="w-full space-y-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-2 border-b border-[#323232] border-opacity-50">
                        <span className="text-[#697485] text-sm font-medium mb-1 sm:mb-0">
                          Position Size
                        </span>
                        <span className="text-[#697586] text-sm font-normal">
                          ${position.size}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-2 border-b border-[#323232] border-opacity-50">
                        <span className="text-[#697485] text-sm font-medium mb-1 sm:mb-0">
                          Entry Price
                        </span>
                        <span className="text-[#697586] text-sm font-normal">
                          {country.markPrice}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-2 border-b border-[#323232] border-opacity-50">
                        <span className="text-[#697485] text-sm font-medium mb-1 sm:mb-0">
                          Liquidation Price
                        </span>
                        <span className="text-[#697586] text-sm font-normal">
                          {country.liquidationPrice}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-2 border-b border-[#323232] border-opacity-50">
                        <span className="text-[#697485] text-sm font-medium mb-1 sm:mb-0">
                          Fees
                        </span>
                        <span className="text-[#697586] text-sm font-normal">
                          $2.50
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-px bg-[#323232] my-4" />

                    {/* Additional Position */}
                    <div className="w-full py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-[#155dee] rounded-full" />
                        <span className="text-[#697485] text-sm font-medium">
                          Abstract
                        </span>
                      </div>
                      <div className="text-[#16b264] text-sm font-normal">
                        $0.24 (+0.5%)
                      </div>
                    </div>
                  </div>
                ) : closeStep ? (
                  <div className="w-full flex-1 px-2 sm:px-4">
                    {/* Progress Steps */}
                    <div className="flex justify-between items-center mb-6 sm:mb-8">
                      {[1, 2, 3, 4].map((number) => (
                        <div key={number} className="flex items-center flex-1">
                          <div
                            className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium ${closeStep === number
                              ? "bg-[#155dee] text-white"
                              : closeStep > number
                                ? "bg-[#155dee] text-white"
                                : "bg-[#2d2d2e] text-gray-400"
                              }`}
                          >
                            {number}
                          </div>
                          {number < 4 && (
                            <div
                              className={`h-0.5 flex-1 mx-1 sm:mx-2 ${closeStep > number ? "bg-[#155dee]" : "bg-[#2d2d2e]"
                                }`}
                            />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Step Content */}
                    <div className="mb-6 space-y-4">
                      {closeStep === 1 && (
                        <>
                          <div className="text-center mb-6">
                            <h2 className="text-white text-lg sm:text-xl font-semibold mb-2">
                              Close Position
                            </h2>
                            <p className="text-gray-400 text-sm">
                              Are you sure you want to close this position?
                            </p>
                          </div>
                          <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                              <span className="text-gray-400 text-sm">Position</span>
                              <span className="text-white text-sm font-medium">
                                {country.name} {position.isLong ? "LONG" : "SHORT"}
                              </span>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                              <span className="text-gray-400 text-sm">Size</span>
                              <span className="text-white text-sm font-medium">${position.size}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                              <span className="text-gray-400 text-sm">Entry Price</span>
                              <span className="text-white text-sm font-medium">
                                {country.markPrice}
                              </span>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                              <span className="text-gray-400 text-sm">Mark Price</span>
                              <span className="text-white text-sm font-medium">
                                {country.markPrice}
                              </span>
                            </div>
                          </div>
                        </>
                      )}

                      {closeStep === 2 && (
                        <>
                          <div className="text-center mb-6">
                            <h2 className="text-white text-lg sm:text-xl font-semibold mb-2">
                              Confirm PnL
                            </h2>
                            <p className="text-gray-400 text-sm">
                              Review your position&apos;s performance
                            </p>
                          </div>
                          {(() => {
                            const { pnl, percentage, fees, isProfit } = getPnLInfo();
                            return (
                              <>
                                <div className="text-center mb-6">
                                  <div className={`text-xl sm:text-2xl font-bold ${isProfit ? "text-[#16b264]" : "text-[#ff4545]"}`}>
                                    {pnl >= 0 ? "+" : "-"}${Math.abs(pnl).toFixed(2)}
                                  </div>
                                  <div className={isProfit ? "text-[#16b264]" : "text-[#ff4545]"}>
                                    ({percentage >= 0 ? "+" : "-"}{Math.abs(percentage).toFixed(2)}%)
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                                    <span className="text-gray-400 text-sm">Trading Fees</span>
                                    <span className="text-white text-sm">-${fees.toFixed(2)}</span>
                                  </div>
                                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                                    <span className="text-gray-400 text-sm">Net PnL</span>
                                    <span className={isProfit ? "text-[#16b264] text-sm" : "text-[#ff4545] text-sm"}>
                                      {pnl - fees >= 0 ? "+" : "-"}${Math.abs(pnl - fees).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </>
                      )}

                      {closeStep === 3 && (
                        <>
                          <div className="text-center mb-6">
                            <h2 className="text-white text-lg sm:text-xl font-semibold mb-2">
                              Updated Balance
                            </h2>
                            <p className="text-gray-400 text-sm">
                              Your new balance after closing position
                            </p>
                          </div>
                          <div className="text-center">
                            <div className="text-white text-2xl sm:text-3xl font-bold mb-2">
                              {newBalance !== null ? `$${newBalance.toFixed(2)}` : "Loading..."}
                            </div>
                            <div className="text-gray-400 text-sm">
                              Previous: {previousBalance !== null ? `$${previousBalance.toFixed(2)}` : "Loading..."}
                            </div>
                          </div>
                        </>
                      )}

                      {closeStep === 4 && (
                        <>
                          <div className="text-center mb-6">
                            <h2 className="text-white text-lg sm:text-xl font-semibold mb-2">
                              Trade History
                            </h2>
                            <p className="text-gray-400 text-sm">
                              Position successfully closed
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <div>
                              <div className="text-white text-sm font-medium">
                                {country.name} {position.isLong ? "LONG" : "SHORT"}
                              </div>
                              <div className="text-gray-400 text-xs">
                                Closed at {new Date().toLocaleTimeString()}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[#16b264] text-sm font-medium">+$0.00</div>
                              <div className="text-gray-400 text-xs">0.0%</div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-6">
                      {closeStep === 1 && (
                        <>
                          <button
                            onClick={() => setCloseStep(null)}
                            className="w-full py-3 rounded-full bg-[#2d2d2e] text-white hover:bg-[#3d3d3e] transition-colors duration-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleCloseStepContinue}
                            className="w-full py-3 rounded-full bg-[#155dee] text-white hover:bg-[#0d4bc4] transition-colors duration-200"
                          >
                            Close Position
                          </button>
                        </>
                      )}
                      {closeStep === 2 && (
                        <button
                          onClick={handleCloseStepContinue}
                          className="w-full py-3 rounded-full bg-[#155dee] text-white hover:bg-[#0d4bc4] transition-colors duration-200"
                        >
                          Continue
                        </button>
                      )}
                      {closeStep === 3 && (
                        <button
                          onClick={handleCloseStepContinue}
                          className="w-full py-3 rounded-full bg-[#155dee] text-white hover:bg-[#0d4bc4] transition-colors duration-200"
                        >
                          View History
                        </button>
                      )}
                      {closeStep === 4 && (
                        <button
                          onClick={handleCloseStepContinue}
                          className="w-full py-3 rounded-full bg-[#155dee] text-white hover:bg-[#0d4bc4] transition-colors duration-200"
                        >
                          View History
                        </button>
                      )}
                      {closeStep === 99 && (
                        <button
                          onClick={handleCloseStepContinue}
                          className="w-full py-3 rounded-full bg-[#155dee] text-white hover:bg-[#0d4bc4] transition-colors duration-200"
                        >
                          Done
                        </button>
                      )}
                    </div>
                  </div>
                ) : closeStep === 99 ? (
                  <div className="w-full overflow-x-auto">
                    <div className="w-full flex flex-col gap-4">
                      {/* Header */}
                      <div className="flex justify-between items-center">
                        <h3 className="text-white text-lg font-medium">Trade History</h3>
                        <button
                          onClick={() => setCloseStep(null)}
                          className="text-gray-400 hover:text-white transition-colors"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* History Table */}
                      <HistoryTable />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
                    <svg
                      className="w-12 h-12 sm:w-16 sm:h-16 text-gray-600 mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2v-14a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    <p className="text-gray-500 text-sm sm:text-base">No open positions</p>
                    <p className="text-gray-600 text-xs sm:text-sm mt-1">
                      Place a trade to see your positions here
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}