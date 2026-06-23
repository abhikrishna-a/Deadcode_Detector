import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquareText, FileCode } from 'lucide-react';
import TeamChatTab from './TeamChatTab';
import SubmissionsReviewPanel from './SubmissionsReviewPanel';
import { User } from '../../types';

interface AIAssistTabProps {
  currentUser: User;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function AIAssistTab({ currentUser, onShowToast }: AIAssistTabProps) {
  const [subTab, setSubTab] = useState<'submissions' | 'teamchat'>('submissions');

  return (
    <div className="flex flex-col gap-4 min-h-0 text-left">
      <div className="flex gap-1 glass-card p-1 rounded-xl w-fit">
        <button
          onClick={() => setSubTab('submissions')}
          className={`relative px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
            subTab === 'submissions' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {subTab === 'submissions' && (
            <motion.div
              layoutId="aiAssistSubTab"
              transition={{ type: 'spring', damping: 20, stiffness: 350 }}
              className="absolute inset-0 rounded-lg bg-cyan-400/10 border border-cyan-400/20"
            />
          )}
          <FileCode size={14} className={subTab === 'submissions' ? 'text-cyan-400' : ''} />
          Pending Reviews
        </button>
        <button
          onClick={() => setSubTab('teamchat')}
          className={`relative px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
            subTab === 'teamchat' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {subTab === 'teamchat' && (
            <motion.div
              layoutId="aiAssistSubTab"
              transition={{ type: 'spring', damping: 20, stiffness: 350 }}
              className="absolute inset-0 rounded-lg bg-cyan-400/10 border border-cyan-400/20"
            />
          )}
          <MessageSquareText size={14} className={subTab === 'teamchat' ? 'text-cyan-400' : ''} />
          Team Chat
        </button>
      </div>

      <AnimatePresence mode="wait">
        {subTab === 'submissions' ? (
          <SubmissionsReviewPanel
            key="submissions"
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        ) : (
          <TeamChatTab
            key="teamchat"
            currentUser={currentUser}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
