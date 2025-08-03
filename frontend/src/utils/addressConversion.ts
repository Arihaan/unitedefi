import TronWeb from 'tronweb'

/**
 * Utility functions for converting addresses between EVM and Tron formats
 */

export interface AddressConversionResult {
  isValid: boolean
  address?: string
  error?: string
}

/**
 * Convert Tron base58 address to hex format
 */
export function tronToHex(base58Address: string): AddressConversionResult {
  try {
    if (!TronWeb.utils.address.isAddress(base58Address)) {
      return {
        isValid: false,
        error: 'Invalid Tron address format'
      }
    }

    const hexAddress = TronWeb.utils.address.toHex(base58Address)
    return {
      isValid: true,
      address: hexAddress
    }
  } catch (error: any) {
    return {
      isValid: false,
      error: error.message || 'Failed to convert Tron address to hex'
    }
  }
}

/**
 * Convert hex address to Tron base58 format
 */
export function hexToTron(hexAddress: string): AddressConversionResult {
  try {
    // Remove '0x' prefix if present
    const cleanHex = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress
    
    // Add Tron address prefix if not present
    const tronHex = cleanHex.startsWith('41') ? cleanHex : '41' + cleanHex
    
    const base58Address = TronWeb.utils.address.fromHex(tronHex)
    
    if (!TronWeb.utils.address.isAddress(base58Address)) {
      return {
        isValid: false,
        error: 'Resulting address is not a valid Tron address'
      }
    }

    return {
      isValid: true,
      address: base58Address
    }
  } catch (error: any) {
    return {
      isValid: false,
      error: error.message || 'Failed to convert hex address to Tron format'
    }
  }
}

/**
 * Validate if an address is a valid Tron base58 address
 */
export function isValidTronAddress(address: string): boolean {
  try {
    return TronWeb.utils.address.isAddress(address)
  } catch {
    return false
  }
}

/**
 * Validate if an address is a valid Ethereum address
 */
export function isValidEthAddress(address: string): boolean {
  // Simple regex check for Ethereum address format
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/
  return ethAddressRegex.test(address)
}

/**
 * Detect address type and return appropriate format for target network
 */
export function convertAddressForNetwork(
  address: string, 
  targetNetwork: 'tron' | 'evm'
): AddressConversionResult {
  if (!address) {
    return {
      isValid: false,
      error: 'Address is required'
    }
  }

  // If target is Tron and we have an EVM address, convert to Tron
  if (targetNetwork === 'tron' && isValidEthAddress(address)) {
    return hexToTron(address)
  }
  
  // If target is EVM and we have a Tron address, convert to hex
  if (targetNetwork === 'evm' && isValidTronAddress(address)) {
    return tronToHex(address)
  }
  
  // If address is already in the correct format, return as-is
  if (targetNetwork === 'tron' && isValidTronAddress(address)) {
    return {
      isValid: true,
      address: address
    }
  }
  
  if (targetNetwork === 'evm' && isValidEthAddress(address)) {
    return {
      isValid: true,
      address: address
    }
  }
  
  return {
    isValid: false,
    error: `Invalid address format for ${targetNetwork} network`
  }
}

/**
 * Get address in both formats if valid
 */
export function getAddressFormats(address: string) {
  const result = {
    original: address,
    tron: null as string | null,
    hex: null as string | null,
    isValid: false
  }

  if (isValidTronAddress(address)) {
    result.tron = address
    const hexResult = tronToHex(address)
    if (hexResult.isValid) {
      result.hex = hexResult.address!
      result.isValid = true
    }
  } else if (isValidEthAddress(address)) {
    result.hex = address
    const tronResult = hexToTron(address)
    if (tronResult.isValid) {
      result.tron = tronResult.address!
      result.isValid = true
    }
  }

  return result
}