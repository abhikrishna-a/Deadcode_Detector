import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, MessageSquareText, FileCode } from 'lucide-react';
import ChatTab from './ChatTab';
import TeamChatTab from './TeamChatTab';
import SubmissionsReviewPanel from './SubmissionsReviewPanel';
import { User, AnalysisResult } from '../../types';

interface AIAssistTabProps {
  currentUser: User;
  history: AnalysisResult[];
  initialDocId?: string;
  initialFilename?: string;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function AIAssistTab({ currentUser, history, initialDocId, initialFilename, onShowToast }: AIAssistTabProps) {
  const [subTab, setSubTab] = useState<'inspector' | 'teamchat' | 'submissions'>('inspector');

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
          onClick={() => setSubTab('inspector')}
          className={`relative px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
            subTab === 'inspector' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {subTab === 'inspector' && (
            <motion.div
              layoutId="aiAssistSubTab"
              transition={{ type: 'spring', damping: 20, stiffness: 350 }}
              className="absolute inset-0 rounded-lg bg-cyan-400/10 border border-cyan-400/20"
            />
          )}
          <MessageCircle size={14} className={subTab === 'inspector' ? 'text-cyan-400' : ''} />
          AI Inspector
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
        ) : subTab === 'inspector' ? (
          <ChatTab
            key="inspector"
            history={history}
            initialDocId={initialDocId}
            initialFilename={initialFilename}
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
