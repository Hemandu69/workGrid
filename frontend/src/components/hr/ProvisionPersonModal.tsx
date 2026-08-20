'use client';

import React, { useState } from 'react';
import { UserRole } from '../../types/auth';
import { useAuth } from '../../lib/auth-context';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface ProvisionPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProvision: (data: {
    name: string;
    email: string;
    title: string;
    role: UserRole;
    capacityLimitHours: number;
  }) => void;
}

export function ProvisionPersonModal({
  isOpen,
  onClose,
  onProvision,
}: ProvisionPersonModalProps) {
  const { role: callerRole } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('MEMBER');
  const [capacityHours, setCapacityHours] = useState(40);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Please fill in required name and email fields.');
      return;
    }

    if (callerRole === 'HR' && (selectedRole === 'SUPER_ADMIN' || selectedRole === 'ADMIN' || selectedRole === 'HR')) {
      setError('HR cannot provision accounts with privileged administrative roles.');
      return;
    }

    onProvision({
      name: name.trim(),
      email: email.trim(),
      title: title.trim() || 'Employee',
      role: selectedRole,
      capacityLimitHours: capacityHours,
    });

    // Reset
    setName('');
    setEmail('');
    setTitle('');
    setSelectedRole('MEMBER');
    setCapacityHours(40);
    setError(null);
    onClose();
  };

  const roleOptions: Array<{ role: UserRole; label: string; allowed: boolean }> = [
    { role: 'MEMBER', label: 'Member (Default Contributor)', allowed: true },
    { role: 'TEAM_LEAD', label: 'Team Lead', allowed: true },
    { role: 'SERVER', label: 'Server (Sector Supervisor)', allowed: true },
    {
      role: 'HR',
      label: 'HR (People Management)',
      allowed: callerRole === 'SUPER_ADMIN',
    },
    {
      role: 'ADMIN',
      label: 'Admin (Operational Admin)',
      allowed: callerRole === 'SUPER_ADMIN',
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Onboard New Employee" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}

        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 leading-relaxed">
          <strong>Onboarding Notice:</strong> Provisioned accounts are created with{' '}
          <span className="font-mono font-semibold">PENDING</span> status by default. They can be reviewed, assigned specific roles, and activated before gaining operational access.
        </div>

        <div>
          <label className="block text-xs font-semibold text-primary mb-1">
            Full Name <span className="text-status-blocked">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jordan Mitchell"
            className="w-full px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-primary mb-1">
            Work Email Address <span className="text-status-blocked">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. jordan.mitchell@workgrid.corp"
            className="w-full px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-primary mb-1">Job Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fullstack Engineer"
            className="w-full px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-primary mb-1">
            Initial WorkGrid Role
          </label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as UserRole)}
            className="w-full px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
          >
            {roleOptions.map((opt) => (
              <option key={opt.role} value={opt.role} disabled={!opt.allowed}>
                {opt.label} {!opt.allowed ? '(Super Admin Only)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-primary mb-1">
            Weekly Capacity Limit (Hours)
          </label>
          <input
            type="number"
            min={10}
            max={60}
            value={capacityHours}
            onChange={(e) => setCapacityHours(parseInt(e.target.value) || 40)}
            className="w-full px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
          />
        </div>

        <div className="pt-3 flex justify-end gap-2 border-t border-surface-outline">
          <Button type="button" variant="outline" onClick={onClose} size="sm">
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Provision Account (Pending)
          </Button>
        </div>
      </form>
    </Modal>
  );
}
