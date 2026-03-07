/**
 * SOAP UI-specific types for the plugin-soap-ui package.
 * These describe the WSDL introspection result returned from the main process IPC handler.
 */

/**
 * A single field/parameter in a WSDL operation input schema.
 * Used to build the Args form in BodyTab.
 */
export interface WsdlFieldSchema {
  name: string;
  /** Primitive type string from XSD/WSDL, e.g. 'string', 'int', 'boolean', 'complex'. */
  type: string;
  required: boolean;
  /** Nested fields for complex types. */
  children?: WsdlFieldSchema[];
}

/**
 * A single WSDL operation under a port.
 */
export interface WsdlOperation {
  name: string;
  /** SOAPAction URI derived from the WSDL binding. */
  soapAction: string;
  /** SOAP version supported by this binding: '1.1', '1.2', or 'unknown'. */
  soapVersion: '1.1' | '1.2' | 'unknown';
  /** Input schema for building the Args form. */
  inputSchema: WsdlFieldSchema[];
}

/**
 * A port (binding endpoint) within a WSDL service.
 */
export interface WsdlPort {
  name: string;
  operations: WsdlOperation[];
}

/**
 * A top-level service in the WSDL document.
 */
export interface WsdlService {
  name: string;
  ports: WsdlPort[];
}

/**
 * Response from the IPC handler `plugin-soap:loadWsdl`.
 */
export interface LoadWsdlResult {
  services: WsdlService[];
}

/**
 * Transient WSDL-loader UI state stored in request.data._ui.wsdlState.
 * Not persisted to the collection file — only used within the editor session.
 */
export interface WsdlUIState {
  /** Whether a WSDL load is in progress. */
  loading?: boolean;
  /** Error message from the last WSDL load attempt. */
  error?: string;
  /** Resolved services tree from the last successful WSDL load. */
  services?: WsdlService[];
}

/**
 * Known IPC channel names for the SOAP plugin.
 */
export const SOAP_IPC_LOAD_WSDL = 'plugin-soap:loadWsdl' as const;
