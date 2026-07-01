import hashlib
import os

class SecurityVerifier:
    @staticmethod
    def calculate_sha256(file_path):
        """Computes the SHA-256 hash of a local file in chunks to prevent memory overhead."""
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except FileNotFoundError:
            return None

    @staticmethod
    def verify_hash(file_path, expected_hash):
        """Verifies if the file hash matches the expected hash value."""
        actual_hash = SecurityVerifier.calculate_sha256(file_path)
        if actual_hash is None:
            return False, f"File {file_path} not found."
        
        if actual_hash.lower() == expected_hash.lower():
            return True, "Integrity check passed. File hash matches."
        else:
            return False, f"Integrity check failed! Expected: {expected_hash}, Got: {actual_hash}"

    @staticmethod
    def verify_signature(file_path, signature_path, trust_key="AETHERNOC-SECURE-KEY-2026"):
        """
        Simulates cryptographic signature verification.
        Validates that the signature file matches the HMAC signature of the file
        computed using the offline trust key.
        """
        if not os.path.exists(file_path):
            return False, "Target file missing."
        if not os.path.exists(signature_path):
            return False, "Signature verification file missing."
        
        try:
            # Read the signature string
            with open(signature_path, "r") as f:
                signature = f.read().strip()
            
            # Compute expected HMAC based on the file content and trust root key
            file_hash = SecurityVerifier.calculate_sha256(file_path)
            # Create a mock HMAC signature string
            expected_sig = hashlib.sha256(f"{file_hash}:{trust_key}".encode()).hexdigest()
            
            if signature == expected_sig:
                return True, "Cryptographic signature validated against local public trust root."
            else:
                return False, "Signature verification failed! Potential model tampering detected."
        except Exception as e:
            return False, f"Signature parsing error: {e}"

# Helper to generate mock signature file for testing
def generate_mock_signature(file_path, signature_path, trust_key="AETHERNOC-SECURE-KEY-2026"):
    file_hash = SecurityVerifier.calculate_sha256(file_path)
    if file_hash:
        expected_sig = hashlib.sha256(f"{file_hash}:{trust_key}".encode()).hexdigest()
        with open(signature_path, "w") as f:
            f.write(expected_sig)
        print(f"[SECURITY] Generated mock signature for {file_path} -> {signature_path}")
