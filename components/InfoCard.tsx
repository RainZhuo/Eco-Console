import React from 'react';

interface InfoCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  color?: "blue" | "green" | "purple" | "yellow" | "red" | "slate";
}

export const InfoCard: React.FC<InfoCardProps> = ({ title, value, subValue, icon, color = "slate" }) => {
  const colorClasses = {
    blue: "border-l-4 border-blue-500 bg-slate-800",
    green: "border-l-4 border-green-500 bg-slate-800",
    purple: "border-l-4 border-purple-500 bg-slate-800",
    yellow: "border-l-4 border-yellow-500 bg-slate-800",
    red: "border-l-4 border-red-500 bg-slate-800",
    slate: "border-l-4 border-slate-500 bg-slate-800",
  };

  return (
    <div className={`${colorClasses[color]} p-4 rounded shadow-md flex items-center justify-between`}>
      <div>
        <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
        {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
      </div>
      {icon && <div className="text-slate-500 opacity-50">{icon}</div>}
    </div>
  );
};