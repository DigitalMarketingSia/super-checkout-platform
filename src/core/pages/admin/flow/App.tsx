import { useEffect } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import './index.css';
import { Editor } from './pages/Editor';
import { Dashboard } from './pages/Dashboard';
import { useFunnelStore } from './store/useFunnelStore';
import { loadFunnel } from './lib/storage';

function EditorWrapper() {
  const { id } = useParams();
  const { setNodes, setEdges, setViewport, setFunnelName } = useFunnelStore();

  useEffect(() => {
    const loadData = async () => {
      const { state: data, name } = await loadFunnel(id);
      setFunnelName(name);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      if (data.viewport) {
        setViewport(data.viewport);
      }
    };
    loadData();
  }, [id, setNodes, setEdges, setViewport, setFunnelName]);

  return <Editor />;
}

export default function App() {
  const { undo, redo } = useFunnelStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="editor/:id" element={<EditorWrapper />} />
    </Routes>
  );
}
