// 네트워크 연결 상태 (NetInfo). 연결이 끊기면 안내만 하고, 쓰기는 여전히 서버 확정이 필요하다 (O01 보류 준수).
// Network connectivity (NetInfo). When offline we only inform; writes still require server confirmation (O01 on hold).
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable 이 null(확인 전)이면 연결로 간주
      // Treat null (not yet determined) reachability as online
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);
  return online;
}
