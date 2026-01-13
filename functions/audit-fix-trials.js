/**
 * Audit and Fix Trials Missing BranchId
 * 
 * This script:
 * 1. Shows all scheduled trials with null branchId
 * 2. Attempts to match them to branches using branchName
 * 3. Updates them with the correct branchId
 * 
 * Run: node audit-fix-trials.js
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'recruitment-633bd' });
}

const db = admin.firestore();

async function auditAndFixTrials() {
  console.log('🔍 Auditing trials and booking links...\n');

  // Get all branches for mapping
  const branchesSnapshot = await db.collection('branches').get();
  const branchMap = new Map();
  
  branchesSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.name) {
      branchMap.set(data.name.toLowerCase().trim(), { id: doc.id, name: data.name, email: data.email });
      branchMap.set(data.name.trim(), { id: doc.id, name: data.name, email: data.email });
    }
  });

  console.log(`📋 Loaded ${branchesSnapshot.size} branches\n`);

  // =========================================================================
  // AUDIT TRIALS
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SCHEDULED TRIALS AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const trialsSnapshot = await db.collection('interviews')
    .where('type', '==', 'trial')
    .where('status', 'in', ['scheduled', 'confirmed'])
    .get();

  const trialsWithBranchId = [];
  const trialsWithoutBranchId = [];

  trialsSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const scheduledDate = data.scheduledDate?.toDate?.() || data.scheduledAt?.toDate?.();
    
    const trial = {
      id: doc.id,
      candidateName: data.candidateName,
      branchId: data.branchId,
      branchName: data.branchName,
      scheduledDate: scheduledDate?.toISOString().split('T')[0] || 'unknown',
      status: data.status
    };

    if (data.branchId) {
      trialsWithBranchId.push(trial);
    } else {
      trialsWithoutBranchId.push(trial);
    }
  });

  console.log(`✅ Trials WITH branchId: ${trialsWithBranchId.length}`);
  trialsWithBranchId.forEach(t => {
    console.log(`   - ${t.candidateName} | ${t.scheduledDate} | ${t.branchName}`);
  });

  console.log(`\n❌ Trials WITHOUT branchId: ${trialsWithoutBranchId.length}`);
  trialsWithoutBranchId.forEach(t => {
    const match = t.branchName ? (branchMap.get(t.branchName.toLowerCase().trim()) || branchMap.get(t.branchName.trim())) : null;
    const canFix = match ? '✅ CAN FIX' : '⚠️ NO MATCH';
    console.log(`   - ${t.candidateName} | ${t.scheduledDate} | ${t.branchName || 'NO BRANCH NAME'} | ${canFix}`);
  });

  // =========================================================================
  // AUDIT BOOKING LINKS
  // =========================================================================
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('ACTIVE BOOKING LINKS AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const linksSnapshot = await db.collection('bookingLinks')
    .where('status', '==', 'active')
    .where('type', '==', 'trial')
    .get();

  const linksWithBranchId = [];
  const linksWithoutBranchId = [];

  linksSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const expiresAt = data.expiresAt?.toDate?.();
    
    const link = {
      id: doc.id,
      candidateName: data.candidateName,
      branchId: data.branchId,
      branchName: data.branchName,
      expiresAt: expiresAt?.toISOString().split('T')[0] || 'unknown'
    };

    if (data.branchId) {
      linksWithBranchId.push(link);
    } else {
      linksWithoutBranchId.push(link);
    }
  });

  console.log(`✅ Trial booking links WITH branchId: ${linksWithBranchId.length}`);
  linksWithBranchId.forEach(l => {
    console.log(`   - ${l.candidateName} | expires: ${l.expiresAt} | ${l.branchName}`);
  });

  console.log(`\n❌ Trial booking links WITHOUT branchId: ${linksWithoutBranchId.length}`);
  linksWithoutBranchId.forEach(l => {
    console.log(`   - ${l.candidateName} | expires: ${l.expiresAt} | ${l.branchName || 'NO BRANCH NAME'}`);
  });

  // =========================================================================
  // FIX TRIALS
  // =========================================================================
  if (trialsWithoutBranchId.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('FIXING TRIALS...');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const batch = db.batch();
    let fixedCount = 0;

    for (const trial of trialsWithoutBranchId) {
      if (trial.branchName) {
        const match = branchMap.get(trial.branchName.toLowerCase().trim()) || branchMap.get(trial.branchName.trim());
        if (match) {
          const ref = db.collection('interviews').doc(trial.id);
          batch.update(ref, { 
            branchId: match.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`   ✅ Fixing: ${trial.candidateName} -> ${match.id}`);
          fixedCount++;
        }
      }
    }

    if (fixedCount > 0) {
      await batch.commit();
      console.log(`\n✅ Fixed ${fixedCount} trials`);
    } else {
      console.log('   No trials could be automatically fixed');
    }
  }

  // =========================================================================
  // FIX BOOKING LINKS
  // =========================================================================
  if (linksWithoutBranchId.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('FIXING BOOKING LINKS...');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const batch = db.batch();
    let fixedCount = 0;

    for (const link of linksWithoutBranchId) {
      // Try to get branchId from candidate
      const linkDoc = await db.collection('bookingLinks').doc(link.id).get();
      const linkData = linkDoc.data();
      
      let branchId = null;
      let branchName = null;

      // Try candidate's branch
      if (linkData?.candidateId) {
        const candidateDoc = await db.collection('candidates').doc(linkData.candidateId).get();
        if (candidateDoc.exists) {
          const candidateData = candidateDoc.data();
          branchId = candidateData.branchId;
          branchName = candidateData.branchName;
        }
      }

      // Try matching by branchName
      if (!branchId && link.branchName) {
        const match = branchMap.get(link.branchName.toLowerCase().trim()) || branchMap.get(link.branchName.trim());
        if (match) {
          branchId = match.id;
          branchName = match.name;
        }
      }

      if (branchId) {
        const ref = db.collection('bookingLinks').doc(link.id);
        batch.update(ref, { 
          branchId,
          branchName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`   ✅ Fixing: ${link.candidateName} -> ${branchId}`);
        fixedCount++;
      } else {
        console.log(`   ⚠️ Cannot fix: ${link.candidateName} (no branch info found)`);
      }
    }

    if (fixedCount > 0) {
      await batch.commit();
      console.log(`\n✅ Fixed ${fixedCount} booking links`);
    }
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Trials: ${trialsWithBranchId.length} OK, ${trialsWithoutBranchId.length} missing branchId`);
  console.log(`Booking Links: ${linksWithBranchId.length} OK, ${linksWithoutBranchId.length} missing branchId`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

auditAndFixTrials()
  .then(() => {
    console.log('🎉 Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
