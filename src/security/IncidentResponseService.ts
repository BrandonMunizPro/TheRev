import { EventEmitter } from 'events';

export enum IncidentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IncidentStatus {
  DETECTED = 'detected',
  INVESTIGATING = 'investigating',
  CONTAINED = 'contained',
  ERADICATED = 'eradicated',
  RECOVERED = 'recovered',
  CLOSED = 'closed',
}

export enum IncidentType {
  SECURITY_BREACH = 'security_breach',
  DATA_LOSS = 'data_loss',
  SERVICE_OUTAGE = 'service_outage',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  COMPLIANCE_VIOLATION = 'compliance_violation',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  AI_ABUSE = 'ai_abuse',
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  discoveredAt: Date;
  reportedBy?: string;
  assignedTo?: string;
  affectedSystems: string[];
  affectedUsers: string[];
  timeline: IncidentEvent[];
  rootCause?: string;
  resolution?: string;
  lessonsLearned?: string;
  closedAt?: Date;
}

export interface IncidentEvent {
  id: string;
  timestamp: Date;
  type: 'status_change' | 'action' | 'note' | 'escalation';
  status?: IncidentStatus;
  action?: string;
  note?: string;
  performedBy?: string;
}

export interface IncidentTemplate {
  id: string;
  name: string;
  type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string;
  initialActions: string[];
  escalationContacts: EscalationContact[];
}

export interface EscalationContact {
  role: string;
  name: string;
  email: string;
  phone?: string;
  notifyOn: IncidentSeverity[];
}

export interface IncidentResponse {
  id: string;
  incidentId: string;
  action: string;
  performedBy: string;
  timestamp: Date;
  result: 'success' | 'failure';
  details?: string;
}

export class IncidentResponseService extends EventEmitter {
  private incidents: Map<string, Incident>;
  private templates: Map<string, IncidentTemplate>;
  private responseActions: Map<string, IncidentResponse[]>;

  constructor() {
    super();
    this.incidents = new Map();
    this.templates = new Map();
    this.responseActions = new Map();
    this.initializeDefaultTemplates();
  }

  private initializeDefaultTemplates(): void {
    const defaultTemplates: IncidentTemplate[] = [
      {
        id: 'security_breach',
        name: 'Security Breach Response',
        type: IncidentType.SECURITY_BREACH,
        severity: IncidentSeverity.CRITICAL,
        title: 'Security Breach Detected',
        description: 'A potential security breach has been detected',
        initialActions: [
          'Isolate affected systems',
          'Preserve evidence',
          'Notify security team',
          'Review access logs',
        ],
        escalationContacts: [
          { role: 'CISO', name: '', email: '', notifyOn: [IncidentSeverity.CRITICAL] },
          { role: 'Security Lead', name: '', email: '', notifyOn: [IncidentSeverity.HIGH, IncidentSeverity.CRITICAL] },
        ],
      },
      {
        id: 'service_outage',
        name: 'Service Outage Response',
        type: IncidentType.SERVICE_OUTAGE,
        severity: IncidentSeverity.HIGH,
        title: 'Service Outage Detected',
        description: 'A service outage has been detected',
        initialActions: [
          'Check system health',
          'Review recent deployments',
          'Notify on-call team',
          'Begin root cause analysis',
        ],
        escalationContacts: [
          { role: 'VP Engineering', name: '', email: '', notifyOn: [IncidentSeverity.CRITICAL] },
          { role: 'On-Call Engineer', name: '', email: '', notifyOn: [IncidentSeverity.HIGH, IncidentSeverity.CRITICAL] },
        ],
      },
      {
        id: 'ai_abuse',
        name: 'AI Abuse Response',
        type: IncidentType.AI_ABUSE,
        severity: IncidentSeverity.MEDIUM,
        title: 'AI Service Abuse Detected',
        description: 'Potential abuse of AI services detected',
        initialActions: [
          'Identify abuse patterns',
          'Block offending accounts',
          'Review rate limits',
          'Document findings',
        ],
        escalationContacts: [
          { role: 'AI Platform Lead', name: '', email: '', notifyOn: [IncidentSeverity.MEDIUM, IncidentSeverity.HIGH, IncidentSeverity.CRITICAL] },
        ],
      },
    ];

    for (const template of defaultTemplates) {
      this.templates.set(template.id, template);
    }
  }

  async createIncident(
    type: IncidentType,
    options: {
      title: string;
      description: string;
      severity: IncidentSeverity;
      discoveredBy?: string;
      affectedSystems?: string[];
      affectedUsers?: string[];
    }
  ): Promise<Incident> {
    const template = Array.from(this.templates.values()).find(t => t.type === type);

    const incident: Incident = {
      id: this.generateId(),
      title: options.title,
      description: options.description,
      type,
      severity: options.severity,
      status: IncidentStatus.DETECTED,
      discoveredAt: new Date(),
      reportedBy: options.discoveredBy,
      affectedSystems: options.affectedSystems || [],
      affectedUsers: options.affectedUsers || [],
      timeline: [
        {
          id: this.generateId(),
          timestamp: new Date(),
          type: 'status_change',
          status: IncidentStatus.DETECTED,
          performedBy: options.discoveredBy,
        },
      ],
    };

    this.incidents.set(incident.id, incident);
    this.emit('incident:created', incident);

    if (template) {
      this.emit('escalation:needed', {
        incident,
        contacts: template.escalationContacts.filter(c => c.notifyOn.includes(options.severity)),
      });
    }

    return incident;
  }

  async updateStatus(
    incidentId: string,
    status: IncidentStatus,
    performedBy: string,
    note?: string
  ): Promise<Incident | null> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    incident.status = status;
    incident.timeline.push({
      id: this.generateId(),
      timestamp: new Date(),
      type: 'status_change',
      status,
      performedBy,
      note,
    });

    if (status === IncidentStatus.CLOSED) {
      incident.closedAt = new Date();
    }

    this.emit('incident:updated', incident);
    return incident;
  }

  async addNote(
    incidentId: string,
    note: string,
    performedBy: string
  ): Promise<Incident | null> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    incident.timeline.push({
      id: this.generateId(),
      timestamp: new Date(),
      type: 'note',
      note,
      performedBy,
    });

    this.emit('incident:note_added', { incident, note });
    return incident;
  }

  async performAction(
    incidentId: string,
    action: string,
    performedBy: string,
    details?: string
  ): Promise<IncidentResponse> {
    const response: IncidentResponse = {
      id: this.generateId(),
      incidentId,
      action,
      performedBy,
      timestamp: new Date(),
      result: 'success',
      details,
    };

    const responses = this.responseActions.get(incidentId) || [];
    responses.push(response);
    this.responseActions.set(incidentId, responses);

    const incident = this.incidents.get(incidentId);
    if (incident) {
      incident.timeline.push({
        id: this.generateId(),
        timestamp: new Date(),
        type: 'action',
        action,
        performedBy,
      });
    }

    this.emit('action:performed', response);
    return response;
  }

  async escalate(
    incidentId: string,
    reason: string,
    escalatedBy: string
  ): Promise<Incident | null> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    incident.timeline.push({
      id: this.generateId(),
      timestamp: new Date(),
      type: 'escalation',
      note: reason,
      performedBy: escalatedBy,
    });

    const template = Array.from(this.templates.values()).find(t => t.type === incident.type);
    if (template) {
      const higherSeverity = this.getNextSeverity(incident.severity);
      if (higherSeverity) {
        incident.severity = higherSeverity;
        this.emit('escalation:needed', {
          incident,
          contacts: template.escalationContacts.filter(c => c.notifyOn.includes(higherSeverity)),
        });
      }
    }

    this.emit('incident:escalated', incident);
    return incident;
  }

  async resolve(
    incidentId: string,
    resolution: string,
    rootCause?: string,
    lessonsLearned?: string
  ): Promise<Incident | null> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    incident.status = IncidentStatus.CLOSED;
    incident.resolution = resolution;
    incident.rootCause = rootCause;
    incident.lessonsLearned = lessonsLearned;
    incident.closedAt = new Date();

    incident.timeline.push({
      id: this.generateId(),
      timestamp: new Date(),
      type: 'status_change',
      status: IncidentStatus.CLOSED,
      note: resolution,
    });

    this.emit('incident:resolved', incident);
    return incident;
  }

  getIncident(incidentId: string): Incident | undefined {
    return this.incidents.get(incidentId);
  }

  getIncidents(filter?: {
    status?: IncidentStatus[];
    severity?: IncidentSeverity[];
    type?: IncidentType;
    since?: Date;
  }): Incident[] {
    return Array.from(this.incidents.values()).filter(incident => {
      if (filter?.status && !filter.status.includes(incident.status)) return false;
      if (filter?.severity && !filter.severity.includes(incident.severity)) return false;
      if (filter?.type && filter.type !== incident.type) return false;
      if (filter?.since && incident.discoveredAt < filter.since) return false;
      return true;
    });
  }

  getActiveIncidents(): Incident[] {
    return this.getIncidents({ status: [IncidentStatus.DETECTED, IncidentStatus.INVESTIGATING, IncidentStatus.CONTAINED] });
  }

  getTemplate(templateId: string): IncidentTemplate | undefined {
    return this.templates.get(templateId);
  }

  addTemplate(template: IncidentTemplate): void {
    this.templates.set(template.id, template);
  }

  private getNextSeverity(current: IncidentSeverity): IncidentSeverity | null {
    const order = [IncidentSeverity.LOW, IncidentSeverity.MEDIUM, IncidentSeverity.HIGH, IncidentSeverity.CRITICAL];
    const currentIndex = order.indexOf(current);
    if (currentIndex < order.length - 1) {
      return order[currentIndex + 1];
    }
    return null;
  }

  private generateId(): string {
    return `incident_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
