import React from 'react';
import { Search as SearchIcon } from 'lucide-react';

const Search: React.FC = () => {
  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <SearchIcon className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">بحث</h2>
      </div>
      <input
        type="text"
        placeholder="ابحث عن أنمي..."
        className="w-full px-4 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
      />
    </div>
  );
};

export default Search;
