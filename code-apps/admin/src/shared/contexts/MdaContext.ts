import { createContext, useContext } from 'react';

export const MdaContext = createContext<boolean | null>(null);

export const useMdaContext = () => useContext(MdaContext);
