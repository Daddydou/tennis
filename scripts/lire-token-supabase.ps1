# Lit le token personnel du CLI Supabase dans le gestionnaire d'identifiants
# Windows (cible « Supabase CLI:supabase ») et l'écrit sur la sortie standard.
#
# Le CLI n'expose aucune commande pour le relire : on passe par CredRead en
# P/Invoke. Le blob est de l'UTF-8, pas de l'UTF-16 comme le veut l'API.

$signature = @'
using System;
using System.Runtime.InteropServices;

public class CredMan {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

  [DllImport("advapi32.dll")]
  static extern void CredFree(IntPtr buffer);

  public static string Read(string target) {
    IntPtr ptr;
    if (!CredRead(target, 1, 0, out ptr)) return null;
    try {
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
      byte[] blob = new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob, blob, 0, (int)c.CredentialBlobSize);
      return System.Text.Encoding.UTF8.GetString(blob);
    } finally {
      CredFree(ptr);
    }
  }
}
'@

Add-Type -TypeDefinition $signature -Language CSharp | Out-Null
$token = [CredMan]::Read('Supabase CLI:supabase')
if (-not $token) { Write-Error 'Token Supabase introuvable.'; exit 1 }
Write-Output $token.Trim()
