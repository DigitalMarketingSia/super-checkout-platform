import { useState, useEffect } from 'react';
import { licenseService } from '../services/licenseService';

export interface Plan {
    id: string;
    label: string;
    maxInstallations: number;
    price: string;
    type: string;
}

export const usePlans = () => {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const data = await licenseService.getAllPlans();
                setPlans(data);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch plans');
            } finally {
                setLoading(false);
            }
        };

        fetchPlans();
    }, []);

    return { plans, loading, error };
};
