export const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toFixed(2);
};

export const formatCurrency = (num: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

// Uniswap v2 style Constant Product Formula (x * y = k)
// dy = (y * dx) / (x + dx)
// where x is input reserve, y is output reserve, dx is input amount
export const getAmountOut = (amountIn: number, reserveIn: number, reserveOut: number): number => {
  if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0;
  // Assuming 0.3% fee usually, but keeping it simple 0 fee for pure math demo unless specified, 
  // keeping purely x*y=k for this simulation to show raw price impact.
  const numerator = amountIn * reserveOut;
  const denominator = reserveIn + amountIn;
  return numerator / denominator;
};

// Sigmoid function for Buyback Rate
// X: dailyNewWealth
// Y: Rate between 0.02 (2%) and 0.08 (8%)
export const calculateBuybackRate = (dailyNewWealth: number): number => {
  const minRate = 0.02;
  const maxRate = 0.08;
  const range = maxRate - minRate;
  
  // Calibrating the sigmoid curve
  // Updated to 500,000 per user request to handle server-wide scale (100 bots * 5000 wealth)
  const midpoint = 500000; 
  const steepness = 0.000005; // Adjusted steepness for the larger x-axis scale

  // Standard Sigmoid: 1 / (1 + e^-x)
  const sigmoidValue = 1 / (1 + Math.exp(-steepness * (dailyNewWealth - midpoint)));
  
  return minRate + (range * sigmoidValue);
};