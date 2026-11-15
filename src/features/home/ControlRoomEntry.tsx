import { Navigate } from 'react-router-dom';
import { controlPath } from '@/app/experience';

/** `/control`: entra no Control Room continuando da última tela aberta (ou da primeira). */
export function ControlRoomEntry() {
  return <Navigate to={controlPath()} replace />;
}
